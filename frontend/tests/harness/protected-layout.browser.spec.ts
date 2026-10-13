import { expect, test } from "@playwright/test";

const first = { id: "nested-reader", name: "Nested Reader", email: null, role: "COMPANY_ADMIN", orgId: "first-company", company: { id: "first-company", name: "First Company" } };

test("a nested child reuses shell and identity without repeating bootstrap", async ({ page }) => {
  let checks = 0;
  await page.route("**/api/auth/session", route => {
    checks++;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: first }) });
  });
  await page.goto("/app/test-child");
  await expect(page.getByRole("heading", { name: "Nested protected content" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Workspace sidebar" })).toHaveCount(1);
  await expect(page.getByRole("main").getByText("Nested Reader")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  expect(checks).toBe(1);
  await page.locator("header").evaluate(header => header.setAttribute("data-layout-probe", "preserved"));
  await page.getByRole("link", { name: "Dashboard content" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("header")).toHaveAttribute("data-layout-probe", "preserved");
  expect(checks).toBe(1);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Nested protected content" })).toBeVisible();
  await expect(page.locator("header")).toHaveAttribute("data-layout-probe", "preserved");
  expect(checks).toBe(1);
});

test("identity changes discard the previous tenant's child state", async ({ page }) => {
  let user = first;
  await page.route("**/api/auth/session", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user }) }));
  await page.goto("/app/test-child");
  await page.getByRole("textbox", { name: "Probe draft" }).fill("Previous tenant draft");
  user = { ...first, id: "new-reader", name: "New Reader", orgId: "new-company", company: { id: "new-company", name: "New Company" } };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("main").getByText("New Reader")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Probe draft" })).toHaveValue("");
  await expect(page.getByText("Nested Reader")).toHaveCount(0);
});
