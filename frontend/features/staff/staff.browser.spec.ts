import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";

const companyId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const invitationId = "10000000-0000-4000-8000-000000000004";
const token = "c".repeat(64);
let backend: Server;
let role: string;
let issued: { email: string; role: string } | false;
let revoked: boolean;
let readsFail: boolean;
let acceptStatus: number;
let memberActive: boolean;
let memberStatus: number;
const memberId = "10000000-0000-4000-8000-000000000009";
let writes: { path: string; method: string; body: unknown; context?: string | string[] }[];

test.beforeAll(async () => {
  backend = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://fixture.invalid").pathname;
    let raw = "";
    for await (const chunk of req) raw += chunk;
    res.setHeader("Content-Type", "application/json");
    let data: unknown;
    if (path === "/auth/session")
      data = { id: userId, name: "Fixture admin", email: "admin@example.com", role, orgId: companyId, company: { id: companyId, name: "Fixture company" } };
    else if (path === "/company/staff/invitations/accept") {
      writes.push({ path, method: req.method ?? "", body: raw ? JSON.parse(raw) : null });
      res.statusCode = acceptStatus;
      data = acceptStatus === 201 ? { accepted: true, email: "accountant@example.com", role: "ACCOUNTANT" } : { message: "Invalid or expired invitation" };
      return res.end(JSON.stringify(acceptStatus === 201 ? { success: true, data } : { success: false, ...(data as object) }));
    } else if (path.startsWith("/company/staff")) {
      if (req.method !== "GET")
        writes.push({ path, method: req.method ?? "", body: raw ? JSON.parse(raw) : null, context: req.headers["x-fleetora-company-context"] });
      if (req.method === "POST") issued = JSON.parse(raw);
      if (req.method === "DELETE") revoked = true;
      if (req.method === "PUT") {
        res.statusCode = memberStatus;
        if (memberStatus !== 200) return res.end(JSON.stringify({ success: false, message: "conflict" }));
        memberActive = JSON.parse(raw).active;
      }
      if (readsFail && req.method === "GET") {
        res.statusCode = 503;
        return res.end(JSON.stringify({ success: false }));
      }
      const invitation = { id: invitationId, email: issued ? issued.email : "", role: issued ? issued.role : "ACCOUNTANT", state: revoked ? "REVOKED" : "PENDING", expiresAt: "2026-12-01T12:00:00Z", createdAt: "2026-11-25T12:00:00Z", acceptedAt: null, revokedAt: null };
      data =
        req.method === "POST"
          ? { companyId, invitation, token, delivery: "MANUAL" }
          : req.method === "DELETE"
            ? { companyId, revoked: true }
            : req.method === "PUT"
              ? { companyId, member: { id: memberId, fullName: "Fixture Accountant", email: "acc@example.com", role: "ACCOUNTANT", active: memberActive } }
            : {
                companyId,
                members: [
                  { id: userId, fullName: "Fixture admin", email: "admin@example.com", role: "COMPANY_ADMIN", active: true },
                  { id: memberId, fullName: "Fixture Accountant", email: "acc@example.com", role: "ACCOUNTANT", active: memberActive },
                ],
                invitations: issued ? [invitation] : [],
              };
    } else data = { companyId, items: [], page: 1, pageSize: 25, hasNext: false };
    res.end(JSON.stringify({ success: true, data }));
  });
  await new Promise<void>((resolve) => backend.listen(3101, "127.0.0.1", resolve));
});
test.afterAll(async () => {
  backend.closeAllConnections();
  await new Promise<void>((resolve) => backend.close(() => resolve()));
});
test.beforeEach(async ({ context }) => {
  role = "COMPANY_ADMIN";
  issued = false;
  revoked = false;
  readsFail = false;
  acceptStatus = 201;
  memberActive = true;
  memberStatus = 200;
  writes = [];
  await context.addCookies([{ name: "fleetora_access", value: "isolated-staff-fixture", url: "http://localhost:3100", httpOnly: true }]);
});

test("admin invites an accountant, sees the one-time link, and revokes it", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.goto("/app/team");
  await expect(page.getByRole("heading", { name: "Team", level: 2 })).toBeVisible();
  await expect(page.getByText("No invitations yet.")).toBeVisible();
  await expect(page.getByText("(You)")).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("accountant@example.com");
  await expect(page.getByLabel("Role")).toHaveValue("ACCOUNTANT");
  await expect(page.getByText(/Cannot manage staff/)).toBeVisible();
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByLabel("Activation link")).toHaveValue(`http://localhost:3100/auth/accept-invitation#token=${token}`);
  await expect(page.getByText(/No email was sent/)).toBeVisible();
  await expect(page.getByText("Accountant · Pending")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss invitation link" }).click();
  await expect(page.getByLabel("Activation link")).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke invitation for accountant@example.com" }).click();
  await expect(page.getByText("Invitation revoked.")).toBeVisible();
  await expect(page.getByText("Accountant · Revoked")).toBeVisible();
  expect(writes).toEqual([
    { path: "/company/staff/invitations", method: "POST", body: { email: "accountant@example.com", role: "ACCOUNTANT" }, context: companyId },
    { path: `/company/staff/invitations/${invitationId}`, method: "DELETE", body: null, context: companyId },
  ]);
  expect(runtimeErrors).toEqual([]);
});

test("admin can choose the company administrator role", async ({ page }) => {
  await page.goto("/app/team");
  await page.getByLabel("Email", { exact: true }).fill("second@example.com");
  await page.getByLabel("Role").selectOption("COMPANY_ADMIN");
  await expect(page.getByText(/including inviting and revoking staff/)).toBeVisible();
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByLabel("Activation link")).toBeVisible();
  expect(writes[0]?.body).toEqual({ email: "second@example.com", role: "COMPANY_ADMIN" });
});

test("load failures are distinct from an empty team and can retry", async ({ page }) => {
  readsFail = true;
  await page.goto("/app/team");
  await expect(page.getByRole("alert").filter({ hasText: "The team could not be loaded" })).toBeVisible();
  await expect(page.getByText("No invitations yet.")).toHaveCount(0);
  readsFail = false;
  await page.getByRole("button", { name: "Refresh" }).last().click();
  await expect(page.getByText("No invitations yet.")).toBeVisible();
});

test("accountants get no team page or navigation entry", async ({ page }) => {
  role = "ACCOUNTANT";
  await page.goto("/app/team");
  await expect(page.getByRole("heading", { name: "Company administrator access required" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("Arabic team workflow stays labeled and fits a narrow screen", async ({ page, context }) => {
  await context.addCookies([{ name: "fleetora_locale", value: "ar", url: "http://localhost:3100" }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/team");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill("accountant@example.com");
  await page.getByRole("button", { name: "إنشاء الدعوة" }).click();
  await expect(page.getByLabel("رابط التفعيل")).toBeVisible();
  const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
});

test("invited person activates an account from the fragment link", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto(`/auth/accept-invitation#token=${token}`);
  await expect(page.getByRole("heading", { name: "Join your company on Fleetora" })).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/accept-invitation$/);
  await page.getByLabel("Full name").fill("Fixture Accountant");
  await page.getByLabel("Password", { exact: true }).fill("Secret12");
  await page.getByLabel("Confirm password").fill("Different1");
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
  expect(writes).toEqual([]);
  // Submitting resets password inputs; the name survives through action state.
  await expect(page.getByLabel("Full name")).toHaveValue("Fixture Accountant");
  await page.getByLabel("Password", { exact: true }).fill("Secret12");
  await page.getByLabel("Confirm password").fill("Secret12");
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page.getByRole("heading", { name: "Your account is ready" })).toBeVisible();
  await expect(page.getByText("accountant@example.com")).toBeVisible();
  expect(writes).toEqual([
    { path: "/company/staff/invitations/accept", method: "POST", body: { token, name: "Fixture Accountant", password: "Secret12" } },
  ]);
});

test("accept page explains invalid links and rejected tokens", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/auth/accept-invitation");
  await expect(page.getByRole("alert").filter({ hasText: "invalid or expired" })).toBeVisible();
  acceptStatus = 400;
  // Adding only a hash to the current URL is not a navigation; load the link fresh.
  await page.goto("about:blank");
  await page.goto(`/auth/accept-invitation#token=${token}`);
  await page.getByLabel("Full name").fill("Fixture Accountant");
  await page.getByLabel("Password", { exact: true }).fill("Secret12");
  await page.getByLabel("Confirm password").fill("Secret12");
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already used" })).toBeVisible();
});

test("admin deactivates after confirming and reactivates a member, but never themself", async ({ page }) => {
  await page.goto("/app/team");
  await expect(page.getByRole("button", { name: "Deactivate Fixture admin" })).toHaveCount(0);
  await page.getByRole("button", { name: "Deactivate Fixture Accountant" }).click();
  await expect(page.getByText(/They are signed out/)).toBeVisible();
  await page.getByRole("button", { name: "Keep active" }).click();
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Deactivate Fixture Accountant" }).click();
  await page.getByRole("button", { name: "Confirm deactivation" }).click();
  await expect(page.getByText("Team member deactivated.")).toBeVisible();
  await expect(page.getByText("Accountant · Inactive")).toBeVisible();
  await page.getByRole("button", { name: "Reactivate Fixture Accountant" }).click();
  await expect(page.getByText(/Team member reactivated/)).toBeVisible();
  expect(writes).toEqual([
    { path: `/company/staff/members/${memberId}/active`, method: "PUT", body: { active: false }, context: companyId },
    { path: `/company/staff/members/${memberId}/active`, method: "PUT", body: { active: true }, context: companyId },
  ]);
});

test("guard refusals explain the self and last-administrator rules", async ({ page }) => {
  memberStatus = 409;
  await page.goto("/app/team");
  await page.getByRole("button", { name: "Deactivate Fixture Accountant" }).click();
  await page.getByRole("button", { name: "Confirm deactivation" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "last active administrator" })).toBeVisible();
  await expect(page.getByText("Accountant · Inactive")).toHaveCount(0);
});
