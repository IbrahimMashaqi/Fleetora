import { createServer, type Server } from "node:http";
import { expect, test, type Locator } from "@playwright/test";
import { translate } from "@/lib/i18n";
import { displayMoney } from "@/features/operations/money";
import { overviewFixture, emptyOverviewFixture } from "@/tests/fixtures/overview";
import { contrastRatio } from "@/tests/ui-assertions";

const companyUser = { id: "overview-admin", name: "Overview Admin", email: null, role: "COMPANY_ADMIN", orgId: "overview-company", company: { id: "overview-company", name: "Overview Logistics" } };
let backend: Server;
let snapshot = overviewFixture(companyUser.orgId);
let overviewStatus = 200;
let requests = 0;
let hold: Promise<void> | null = null;
let release: (() => void) | null = null;
let currentUser = companyUser;

test.beforeAll(async () => {
  backend = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    const respond = (data: unknown) => response.end(JSON.stringify({ success: true, data }));
    if (request.url === "/auth/session") return respond(currentUser);
    if (request.url === "/dashboard/overview") {
      requests += 1;
      if (hold) await hold;
      if (response.destroyed) return;
      if (overviewStatus !== 200) return response.writeHead(overviewStatus).end(JSON.stringify({ success: false }));
      return respond(snapshot);
    }
    if (request.url === "/fleet/locations") return respond({ companyId: currentUser.orgId, serverTime: new Date().toISOString(), freshnessSeconds: 45, headquarters: null, drivers: [] });
    response.writeHead(503).end(JSON.stringify({ success: false }));
  });
  await new Promise<void>((resolve, reject) => { backend.once("error", reject); backend.listen(3101, "127.0.0.1", resolve); });
});

test.beforeEach(async ({ context, page }) => {
  snapshot = overviewFixture(companyUser.orgId);
  overviewStatus = 200; requests = 0; hold = null; release = null; currentUser = companyUser;
  await context.addCookies([{ name: "fleetora_access", value: "overview-session-fixture", url: "http://localhost:3100", httpOnly: true }]);
  await page.route("**/api/auth/session", route => route.fulfill({ json: { user: currentUser } }));
  await page.route("https://tiles.openfreemap.org/**", route => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.afterEach(() => { release?.(); });
test.afterAll(async () => { backend.closeAllConnections(); await new Promise<void>(resolve => backend.close(() => resolve())); });

function metric(section: Locator, label: string) {
  return section.locator("dl > div").filter({ has: section.page().getByText(label, { exact: true }) }).first();
}

for (const locale of ["en", "ar"] as const) {
  for (const width of [1920, 1440, 1280, 1024, 768, 390]) {
    test(`scoped overview figures and charts render below tracking in ${locale} at ${width}px`, async ({ page, context }, testInfo) => {
      const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
      await context.addCookies([{ name: "fleetora_locale", value: locale, url: "http://localhost:3100" }]);
      await page.setViewportSize({ width, height: 1000 });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.text().includes("same key")) errors.push(message.text()); });
      await page.goto("/app");
      const section = page.getByRole("region", { name: t("Company snapshot"), exact: true });
      await expect(section).toBeVisible();
      const statistics = section.locator("dl").filter({ has: page.getByText(t("Total parcels"), { exact: true }) });
      await expect(statistics.locator(":scope > div")).toHaveCount(8);
      await expect(metric(section, t("Total parcels")).locator("dd").first()).toHaveText((10).toLocaleString(locale));
      await expect(metric(section, t("Delivered today")).locator("dd").first()).toHaveText((2).toLocaleString(locale));
      await expect(metric(section, t("COD pending collection")).locator("dd").first()).toHaveText(displayMoney("1234.50", "ILS", locale));
      for (const title of ["Parcels by status", "Daily parcel activity", "Delivery & return performance", "COD & financial snapshot"] as const)
        await expect(section.getByRole("heading", { name: t(title), exact: true })).toBeVisible();
      await expect(section.locator(".recharts-surface")).toHaveCount(3);
      const performance = section.getByRole("region", { name: t("Delivery & return performance"), exact: true });
      const outcomeLabels = performance.locator(".recharts-label-list text");
      await expect(outcomeLabels).toHaveText([4, 1, 5].map(value => value.toLocaleString(locale)));
      const bars = performance.locator(".recharts-bar-rectangle");
      const chartBounds = await performance.locator(".recharts-surface").boundingBox();
      for (const [index, label] of (await outcomeLabels.all()).entries()) {
        const bounds = await label.boundingBox();
        const barBounds = await bars.nth(index).boundingBox();
        if (!bounds || !barBounds || !chartBounds) throw new Error("Performance chart geometry missing");
        expect(bounds.width).toBeGreaterThan(0);
        expect(bounds.x).toBeGreaterThanOrEqual(chartBounds.x);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(chartBounds.x + chartBounds.width);
        if (locale === "ar") expect(bounds.x + bounds.width).toBeLessThanOrEqual(barBounds.x);
        else expect(bounds.x).toBeGreaterThanOrEqual(barBounds.x + barBounds.width);
      }
      await expect(section.getByText(t("Created and delivered over the last 7 days · UTC"), { exact: true })).toBeVisible();
      const geometry = await section.evaluate(element => {
        const map = document.querySelector('[aria-labelledby="fleet-preview-title"]');
        if (!map) throw new Error("Tracking section missing");
        return { top: element.getBoundingClientRect().top, mapBottom: map.getBoundingClientRect().bottom, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      expect(geometry.top).toBeGreaterThanOrEqual(geometry.mapBottom);
      expect(geometry.overflow).toBe(false);
      expect(await contrastRatio(metric(section, t("Total parcels")).locator("dt"))).toBeGreaterThanOrEqual(4.5);
      expect(await contrastRatio(metric(section, t("Total parcels")).locator("dd").last())).toBeGreaterThanOrEqual(4.5);
      await section.getByText(t("View daily activity data"), { exact: true }).click();
      const table = section.getByRole("table");
      await expect(table).toBeVisible();
      await expect(table.getByRole("row")).toHaveCount(8);
      if (width === 1440 || width === 390) await section.screenshot({ path: testInfo.outputPath(`overview-${locale}-${width}.png`) });
      expect(errors).toEqual([]);
    });
  }

  test(`overview currencies stay separate and preserve JOD precision in ${locale}`, async ({ page, context }) => {
    const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
    await context.addCookies([{ name: "fleetora_locale", value: locale, url: "http://localhost:3100" }]);
    await page.goto("/app");
    const section = page.getByRole("region", { name: t("Company snapshot"), exact: true });
    await section.getByRole("combobox", { name: t("Overview currency"), exact: true }).selectOption("JOD");
    await expect(metric(section, t("COD pending collection")).locator("dd").first()).toHaveText(displayMoney("14.125", "JOD", locale));
    await expect(section.getByText(displayMoney("-2.750", "JOD", locale), { exact: true })).toBeVisible();
    await expect(section.getByText(displayMoney("1234.50", "ILS", locale), { exact: true })).toHaveCount(0);
    expect(requests).toBe(1);
  });

  test(`empty overview remains truthful zero data in ${locale}`, async ({ page, context }) => {
    const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
    snapshot = emptyOverviewFixture(companyUser.orgId);
    await context.addCookies([{ name: "fleetora_locale", value: locale, url: "http://localhost:3100" }]);
    await page.goto("/app");
    const section = page.getByRole("region", { name: t("Company snapshot"), exact: true });
    await expect(metric(section, t("Total parcels")).locator("dd").first()).toHaveText((0).toLocaleString(locale));
    await expect(section.getByText(t("No parcel activity yet"), { exact: true })).toBeVisible();
    await expect(section.getByText(t("No parcel activity in the last 7 days"), { exact: true })).toBeVisible();
    await expect(section.getByText(t("No financial activity recorded yet"), { exact: true })).toBeVisible();
    await expect(section.getByRole("alert")).toHaveCount(0);
    await expect(section.getByRole("combobox")).toHaveCount(0);
    await expect(section.locator(".recharts-surface")).toHaveCount(0);
  });
}

test("overview shows a skeleton until real aggregates arrive", async ({ page }) => {
  hold = new Promise<void>(resolve => { release = resolve; });
  await page.goto("/app");
  const section = page.getByRole("region", { name: "Company snapshot", exact: true });
  await expect(section.getByRole("status", { name: "Loading overview statistics..." })).toBeVisible();
  await expect(section.getByText("1,234.50 ILS", { exact: true })).toHaveCount(0);
  release?.(); hold = null;
  await expect(metric(section, "Total parcels").locator("dd").first()).toHaveText("10");
  await expect(section.getByRole("status")).toHaveCount(0);
});

test("failed statistics can retry without replacing tracking or fabricating zero figures", async ({ page }) => {
  overviewStatus = 503;
  await page.goto("/app");
  const section = page.getByRole("region", { name: "Company snapshot", exact: true });
  await expect(section.getByRole("alert")).toContainText("Statistics are temporarily unavailable");
  await expect(section.locator("dl")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Live Tracking", exact: true })).toBeVisible();
  overviewStatus = 200;
  await section.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(metric(section, "Total parcels").locator("dd").first()).toHaveText("10");
  expect(requests).toBe(2);
});

test("mismatched-company statistics are never rendered", async ({ page }) => {
  snapshot = overviewFixture("other-company");
  await page.goto("/app");
  const section = page.getByRole("region", { name: "Company snapshot", exact: true });
  await expect(section.getByRole("alert")).toBeVisible();
  await expect(section.locator("dl")).toHaveCount(0);
  await expect(section.getByText("1,234.50 ILS", { exact: true })).toHaveCount(0);
});

test("overview statistics respect existing company-admin presentation", async ({ page }) => {
  currentUser = { ...companyUser, role: "MERCHANT" };
  await page.goto("/app");
  await expect(page.getByRole("main").getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Company snapshot", exact: true })).toHaveCount(0);
  expect(requests).toBe(0);
});
