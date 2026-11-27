import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
const companyId = "10000000-0000-4000-8000-000000000001";
const workerId = "10000000-0000-4000-8000-000000000003";
const invitationId = "10000000-0000-4000-8000-000000000004";
const token = "d".repeat(64);
const url = `https://fleetora.example.invalid/driver/activate#token=${token}`;
let server: Server,
  activationStatus: number,
  linked: boolean,
  accessActive: boolean,
  offboarded: boolean,
  invited: boolean;
let writes: { path: string; method: string; body: unknown }[];
let invitationBlockedReason: string | null;
let driverPhone: string;
let invitationFailure: { status: number; message: string } | null;
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://fixture.invalid").pathname;
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    if (req.method !== "GET")
      writes.push({ path, method: req.method ?? "", body });
    let data: unknown;
    if (path === "/auth/session")
      data = {
        id: "driver-ops",
        name: "Operations fixture",
        email: null,
        role: "OPERATIONS",
        orgId: companyId,
        company: { id: companyId, name: "Driver company", currency: "ILS" },
      };
    else if (path === "/driver/invitations/accept") {
      res.statusCode = activationStatus;
      data = { accepted: true };
    } else if (path === `/drivers/${workerId}/invitations`) {
      if (invitationFailure) {
        res.statusCode = invitationFailure.status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: false, message: invitationFailure.message }));
        return;
      }
      invited = req.method !== "DELETE";
      data =
        req.method === "DELETE"
          ? { companyId, revoked: true }
          : {
              companyId,
              workerId,
              phone: "+970591234567",
              invitationId,
              url,
              expiresAt: "2026-12-01T12:00:00Z",
            };
    } else if (path === `/drivers/${workerId}/access`) {
      if (req.method === "DELETE") {
        accessActive = false;
        data = { companyId, revoked: true };
      } else
        data = {
          companyId,
          workerId,
          phone: "+970591234567",
          linked,
          accessActive,
          offboarded,
          pendingInvitation: invited
            ? { id: invitationId, expiresAt: "2026-12-01T12:00:00Z" }
            : null,
          invitationBlockedReason,
        };
    } else if (path === `/drivers/${workerId}/offboarding`) {
      offboarded = true;
      if (body.revokeAccess) accessActive = false;
      data = { companyId, offboarded: true, accessRevoked: body.revokeAccess };
    } else if (path.startsWith("/drivers")) {
      if (path === `/drivers/${workerId}` && req.method === "PATCH") {
        driverPhone = body.phone;
        invitationBlockedReason = null;
      }
      const driver = {
        id: workerId,
        name: "Invited Driver",
        phone: driverPhone,
        status: "OFFLINE",
        vehicle: null,
      };
      data =
        path === "/drivers"
          ? {
              companyId,
              items: [driver],
              page: 1,
              pageSize: 20,
              hasNext: false,
            }
          : { companyId, driver };
    } else
      data = { companyId, items: [], page: 1, pageSize: 25, hasNext: false };
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: res.statusCode < 400, data }));
  });
  await new Promise<void>((resolve) =>
    server.listen(3101, "127.0.0.1", resolve),
  );
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test.beforeEach(() => {
  activationStatus = 200;
  linked = false;
  accessActive = false;
  offboarded = false;
  invited = false;
  invitationBlockedReason = null;
  driverPhone = "0591234567";
  invitationFailure = null;
  writes = [];
});
for (const locale of ["en", "ar"] as const) {
  test(`public driver activation keeps the token out of URLs and confirms a password in ${locale}`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "fleetora_locale", value: locale, url: "http://localhost:3100" },
    ]);
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(`/driver/activate#token=${token}`);
    await page
      .getByLabel(locale === "en" ? "Password" : "كلمة المرور", { exact: true })
      .fill("Driver123");
    await page
      .getByLabel(locale === "en" ? "Confirm password" : "تأكيد كلمة المرور", {
        exact: true,
      })
      .fill("Driver123");
    await page
      .getByRole("button", {
        name: locale === "en" ? "Activate driver account" : "تفعيل حساب السائق",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name:
          locale === "en" ? "Your driver account is ready" : "حساب السائق جاهز",
      }),
    ).toBeVisible();
    expect(writes).toEqual([
      {
        path: "/driver/invitations/accept",
        method: "POST",
        body: { token, password: "Driver123" },
      },
    ]);
    expect(requests.every((value) => !value.includes(token))).toBe(true);
    await expect(page).toHaveURL(/\/driver\/activate$/);
  });
}
test("invalid activation never dispatches; expired invitations show an actionable error", async ({
  page,
}) => {
  await page.goto("/driver/activate#token=bad");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Ask your company administrator" }),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
  activationStatus = 400;
  await page.goto(`/driver/activate#token=${token}`);
  await page.getByLabel("Password", { exact: true }).fill("Driver123");
  await page.getByLabel("Confirm password", { exact: true }).fill("Driver123");
  await page
    .getByRole("button", { name: "Activate driver account", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "expired" }),
  ).toBeVisible();
});
for (const locale of ["en", "ar"] as const) {
  test(`duplicate phone keeps the access panel loaded and explains the invitation block in ${locale}`, async ({
    page,
    context,
  }) => {
    invitationBlockedReason = "PHONE_IN_USE";
    await context.addCookies([
      { name: "fleetora_locale", value: locale, url: "http://localhost:3100" },
      {
        name: "fleetora_access",
        value: "driver-operations-fixture",
        url: "http://localhost:3100",
        httpOnly: true,
      },
    ]);
    await page.goto("/app/drivers");
    await page.getByRole("button", { name: /Invited Driver/ }).click();
    await expect(
      page.getByText(
        locale === "en"
          ? "This phone is already used by another driver account. Edit this driver's phone before inviting."
          : "هذا الرقم مستخدم لحساب سائق آخر. عدّل رقم هذا السائق قبل إرسال الدعوة.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name:
          locale === "en" ? "Create driver invitation" : "إنشاء دعوة للسائق",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: locale === "en" ? "Offboard driver" : "إنهاء عمل السائق",
        exact: true,
      }),
    ).toBeEnabled();
    expect(writes).toEqual([]);
    if (locale === "en") {
      await page.getByRole("button", { name: "Edit details", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Edit driver", exact: true });
      await editor.getByLabel("Phone number").fill("0569876543");
      await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(editor).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Create driver invitation", exact: true })).toBeEnabled();
      await expect(page.getByText("This phone is already used by another driver account. Edit this driver's phone before inviting.", { exact: true })).toHaveCount(0);
      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatchObject({ method: "PATCH", path: `/drivers/${workerId}` });
    }
  });
}
for (const locale of ["en", "ar"] as const) {
  for (const failure of [
    { status: 400, message: "Driver invitations require an HTTPS FRONTEND_URL", en: "Configure an HTTPS activation website before creating driver invitations.", ar: "هيّئ موقع تفعيل آمنًا عبر HTTPS قبل إنشاء دعوات السائقين." },
    { status: 409, message: "This phone already has a driver account", en: "This phone is already used by another driver account.", ar: "هذا الرقم مستخدم لحساب سائق آخر." },
    { status: 403, message: "Operation is not permitted", en: "You don't have permission to manage driver access.", ar: "ليس لديك صلاحية إدارة وصول السائق." },
  ]) {
    test(`shows ${failure.status} invitation reason in ${locale}`, async ({ page, context }) => {
      invitationFailure = failure;
      await context.addCookies([
        { name: "fleetora_locale", value: locale, url: "http://localhost:3100" },
        { name: "fleetora_access", value: "driver-operations-fixture", url: "http://localhost:3100", httpOnly: true },
      ]);
      await page.goto("/app/drivers");
      await page.getByRole("button", { name: /Invited Driver/ }).click();
      await page.getByRole("button", { name: locale === "en" ? "Create driver invitation" : "إنشاء دعوة للسائق", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: locale === "en" ? failure.en : failure.ar })).toBeVisible();
      await expect(page.getByLabel("Driver activation link")).toHaveCount(0);
    });
  }
}
test("Operations shares an HTTPS invitation through WhatsApp and offboards with optional security revocation", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "fleetora_access",
      value: "driver-operations-fixture",
      url: "http://localhost:3100",
      httpOnly: true,
    },
  ]);
  await page.goto("/app/drivers");
  await page
    .getByRole("button", { name: "View Invited Driver", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create driver invitation", exact: true })
    .click();
  await expect(page.getByLabel("Driver activation link")).toHaveValue(url);
  const share = page.getByRole("link", { name: "Send via WhatsApp" });
  const href = new URL((await share.getAttribute("href"))!);
  expect(href.origin + href.pathname).toBe("https://wa.me/970591234567");
  expect(href.searchParams.get("text")).toContain(url);
  expect(href.searchParams.get("text")).toContain("مرحبًا");
  await page
    .getByRole("button", { name: "Offboard driver", exact: true })
    .click();
  await page.getByLabel("Also revoke login access").check();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByText("Offboarded — no new tasks", { exact: true }),
  ).toBeVisible();
  expect(writes.at(-1)).toMatchObject({
    path: `/drivers/${workerId}/offboarding`,
    body: { revokeAccess: true },
  });
  await expect(page.getByLabel("Driver activation link")).toHaveCount(0);
});
