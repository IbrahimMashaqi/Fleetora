import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import type { SessionUser } from "@/lib/auth/session.types";

const companyUser: SessionUser = {
  id: "account-reader", name: "Amina Hassan", email: "amina@example.invalid",
  role: "COMPANY_ADMIN", orgId: "account-company",
  company: { id: "account-company", name: "Amina Logistics" },
};
let server: Server;
let user: SessionUser;
let updateStatus: number;
let updateBody: unknown;
let disconnect: boolean;
let delay: number;
let updates: { body: unknown; authorization: string | undefined }[];

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/auth/session") {
      response.end(JSON.stringify({ success: true, data: user }));
      return;
    }
    if (request.url === "/auth/logout") {
      response.end(JSON.stringify({ success: true, data: { message: "Logged out" } }));
      return;
    }
    if (request.url !== "/auth/update-password" || request.method !== "POST") {
      response.writeHead(500).end(JSON.stringify({ message: "Unexpected fixture request" }));
      return;
    }
    let raw = "";
    for await (const chunk of request) raw += chunk;
    updates.push({ body: JSON.parse(raw), authorization: request.headers.authorization });
    if (disconnect) { request.socket.destroy(); return; }
    await new Promise(resolve => setTimeout(resolve, delay));
    response.writeHead(updateStatus).end(JSON.stringify(updateBody));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3101, "127.0.0.1", resolve);
  });
});

test.beforeEach(async ({ context }) => {
  user = companyUser;
  updateStatus = 200;
  updateBody = { success: true, data: { success: true, message: "Password updated successfully" } };
  disconnect = false;
  delay = 0;
  updates = [];
  await context.addCookies([
    { name: "fleetora_access", value: "fixture-account-access", url: "http://localhost:3100", httpOnly: true },
    { name: "fleetora_refresh", value: "fixture-account-refresh", url: "http://localhost:3100", httpOnly: true },
  ]);
});

test.afterAll(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function fillPasswords(page: Page, password = "NewPassword9", confirmation = password) {
  await page.getByLabel("Current password", { exact: true }).fill("CurrentPassword9");
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password", { exact: true }).fill(confirmation);
}

test("renders verified account details and the password form", async ({ page }) => {
  await page.goto("/app/account");
  await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByText(companyUser.name, { exact: true })).toBeVisible();
  await expect(main.getByText(companyUser.email!, { exact: true })).toBeVisible();
  await expect(main.getByText("Company administrator", { exact: true })).toBeVisible();
  await expect(main.getByText(companyUser.company!.name, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Current password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change password", exact: true })).toBeVisible();
  await expect(main).not.toContainText(companyUser.id);
  await expect(main).not.toContainText(companyUser.orgId!);
});

test("renders companyless platform context and missing email truthfully", async ({ page }) => {
  user = { ...companyUser, role: "PLATFORM_ADMIN", email: null, orgId: null, company: null };
  await page.goto("/app/account");
  const main = page.getByRole("main");
  await expect(main.getByText("Platform administrator", { exact: true })).toBeVisible();
  await expect(main.getByText("Platform administration", { exact: true })).toBeVisible();
  await expect(main.getByText("Email not provided", { exact: true })).toBeVisible();
  await expect(page.getByText("Amina Logistics")).toHaveCount(0);
});

test("redirects unauthenticated account entry without rendering identity", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/app/account");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(companyUser.name)).toHaveCount(0);
  expect(updates).toHaveLength(0);
});

test("validates confirmation and password policy before backend mutation", async ({ page }) => {
  await page.goto("/app/account");
  await fillPasswords(page, "NewPassword9", "DifferentPassword9");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByText("Passwords do not match.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirm new password")).toHaveAttribute("aria-invalid", "true");
  await fillPasswords(page, "lowercase");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByText("Use at least 6 characters, including an uppercase letter.", { exact: true })).toBeVisible();
  expect(updates).toHaveLength(0);
});

test("submits once through the real action and clears sensitive values on success", async ({ page }) => {
  delay = 900;
  let actionBody: string | undefined;
  // Capture the actual server response before delivering it to Chrome. Chrome
  // can release a streamed action body during React's subsequent update.
  await page.route("**/app/account", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
    actionBody = await response.text();
    await route.fulfill({ response, body: actionBody });
  });
  await page.goto("/app/account");
  await fillPasswords(page);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByRole("button", { name: "Changing password...", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Current password", { exact: true })).toBeDisabled();
  await page.locator("form").filter({ has: page.getByLabel("Current password", { exact: true }) }).evaluate(form => {
    if (form instanceof HTMLFormElement) form.requestSubmit();
  });
  await expect(page.getByText("Your password has been changed.", { exact: true })).toBeVisible();
  for (const label of ["Current password", "New password", "Confirm new password"]) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue("");
  }
  expect(updates).toEqual([{ body: { oldPassword: "CurrentPassword9", newPassword: "NewPassword9" }, authorization: "Bearer fixture-account-access" }]);
  expect(actionBody).toBeDefined();
  expect(actionBody).not.toMatch(/CurrentPassword9|NewPassword9|fixture-account-(access|refresh)/);
  expect(await page.evaluate(() => JSON.stringify({ cookies: document.cookie, local: localStorage, session: sessionStorage }))).not.toMatch(/CurrentPassword9|NewPassword9|fixture-account-(access|refresh)/);
});

test("maps an incorrect current password to an accessible field error", async ({ page }) => {
  updateStatus = 400;
  updateBody = { success: false, data: null, message: "Last password is incorrect" };
  await page.goto("/app/account");
  await fillPasswords(page);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByText("Your current password is incorrect.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Current password", { exact: true })).toHaveAttribute("aria-invalid", "true");
  expect(updates).toHaveLength(1);
});

test("returns to sign in when the password endpoint rejects authentication", async ({ page, context }) => {
  updateStatus = 401;
  updateBody = { success: false, message: "Unauthorized" };
  await page.goto("/app/account");
  await fillPasswords(page);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).filter(cookie => ["fleetora_access", "fleetora_refresh"].includes(cookie.name))).toHaveLength(0);
  await expect(page.getByText(companyUser.name)).toHaveCount(0);
  expect(updates).toHaveLength(1);
});

test("does not replay an uncertain password change or expose upstream details", async ({ page }) => {
  disconnect = true;
  await page.goto("/app/account");
  await fillPasswords(page);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByText(/couldn.t confirm whether your password changed/i)).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in again", exact: true })).toHaveAttribute("href", "/login");
  expect(updates).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Change password", exact: true })).toBeEnabled();
});

test("navigates between Overview and Account without duplicating the shell", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");
  const sidebar = page.getByRole("complementary", { name: "Workspace sidebar" });
  await sidebar.getByRole("link", { name: "Account & security", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account & security", exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(sidebar.getByRole("link", { name: "Account & security", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Overview", exact: true })).not.toHaveAttribute("aria-current");
  await expect(page.getByRole("complementary", { name: "Workspace sidebar" })).toHaveCount(1);
  await nav.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
});

test("supports responsive account content and keyboard mobile navigation", async ({ page }) => {
  user = { ...companyUser, name: "Account Reader with a long display name", company: { id: "account-company", name: "Regional Logistics and Distribution Company with a Long Name" } };
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app/account");
    await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath("account-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: test.info().outputPath("account-mobile.png"), fullPage: true });
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Open navigation" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close navigation" })).toBeFocused();
  await expect(dialog.getByRole("link", { name: "Account & security", exact: true })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
});

test("discards password drafts when verified identity changes and preserves logout", async ({ page }) => {
  await page.goto("/app/account");
  await fillPasswords(page);
  user = { ...companyUser, id: "another-account", name: "Another Reader", orgId: "another-company", company: { id: "another-company", name: "Another Company" } };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("main").getByText("Another Reader", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Current password", { exact: true })).toHaveValue("");
  await expect(page.getByText("Amina Hassan")).toHaveCount(0);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(updates).toHaveLength(0);
});
