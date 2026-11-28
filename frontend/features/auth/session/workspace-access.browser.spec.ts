import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { translate } from "@/lib/i18n";
import { contrastRatio } from "@/tests/ui-assertions";

let backend: Server;
let role = "ACCOUNTANT";
const reads: string[] = [];

test.beforeAll(async () => {
  backend = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    const path = new URL(request.url ?? "/", "http://fixture.invalid").pathname;
    reads.push(path);
    if (path === "/auth/session") {
      return response.end(JSON.stringify({
        success: true,
        data: { id: "user-1", name: "Rana Saleh", email: "rana@example.invalid", role, orgId: "company-1", company: { id: "company-1", name: "Fixture Logistics", currency: "ILS" } },
      }));
    }
    response.writeHead(503).end(JSON.stringify({ success: false }));
  });
  await new Promise<void>((resolve, reject) => { backend.once("error", reject); backend.listen(3101, "127.0.0.1", resolve); });
});
test.afterAll(async () => { backend.closeAllConnections(); await new Promise<void>(resolve => backend.close(() => resolve())); });
test.beforeEach(async ({ context, page }) => {
  reads.length = 0;
  await context.addCookies([{ name: "fleetora_access", value: "access-fixture", url: "http://localhost:3100", httpOnly: true }]);
  await page.route("https://tiles.openfreemap.org/**", route => route.abort());
});

for (const locale of ["en", "ar"] as const) {
  for (const [fixtureRole, path] of [["ACCOUNTANT", "/app/pricing"], ["ACCOUNTANT", "/app/settings"], ["OPERATIONS", "/app/settlements/new"], ["ACCOUNTANT", "/app/live-map"]] as const) {
    test(`${fixtureRole} opening ${path} by URL sees the shared no-access page in ${locale}`, async ({ page, context }) => {
      role = fixtureRole;
      await context.addCookies([{ name: "fleetora_locale", value: locale, url: "http://localhost:3100" }]);
      await page.goto(path);
      await expect(page.getByRole("heading", { name: translate(locale, "You don't have access to this page"), exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: translate(locale, "Back to Overview"), exact: true })).toHaveAttribute("href", "/app");
      await expect(page.locator("[data-no-access]")).toHaveCount(1);
      expect(reads.filter(read => read !== "/auth/session")).toEqual([]);
    });
  }
}

test("navigation offers only routes the role can open", async ({ page }) => {
  role = "OPERATIONS";
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/account");
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(nav.getByRole("link", { name: "Vehicle assignment", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Merchant settlements" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Delivery pricing" })).toHaveCount(0);
});

test("the Arabic password field keeps its reveal button clear of the text", async ({ page, context }) => {
  await context.clearCookies();
  await context.addCookies([{ name: "fleetora_locale", value: "ar", url: "http://localhost:3100" }]);
  for (const [path, id] of [["/login", "login-password"], ["/signup", "signup-password"]] as const) {
    await page.goto(path);
    const geometry = await page.locator(`#${id}`).evaluate(input => {
      const toggle = input.parentElement?.querySelector("button");
      if (!toggle) throw new Error("Missing password toggle");
      const field = input.getBoundingClientRect(), button = toggle.getBoundingClientRect(), style = getComputedStyle(input);
      return { textStart: field.left + parseFloat(style.paddingLeft), textEnd: field.right - parseFloat(style.paddingRight), buttonLeft: button.left, buttonRight: button.right };
    });
    const buttonInsideText = geometry.buttonRight > geometry.textStart && geometry.buttonLeft < geometry.textEnd;
    expect(buttonInsideText, path).toBe(false);
  }
});

test("the sidebar signals hidden navigation items at a 900px desktop height", async ({ page }) => {
  role = "COMPANY_ADMIN";
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/account");
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  const state = await nav.evaluate(element => ({ overflow: element.scrollHeight > element.clientHeight, background: getComputedStyle(element).backgroundImage }));
  if (state.overflow) expect(state.background).toContain("linear-gradient");
  await nav.getByRole("link", { name: "Merchant settlements" }).scrollIntoViewIfNeeded();
  await expect(nav.getByRole("link", { name: "Merchant settlements" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Log out" })).toBeInViewport();
  expect(await contrastRatio(page.getByRole("button", { name: "Log out" }))).toBeGreaterThanOrEqual(4.5);
});
