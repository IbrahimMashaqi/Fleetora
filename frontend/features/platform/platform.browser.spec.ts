import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
const id = "10000000-0000-4000-8000-000000000001";
let server: Server, role: string, companyUser: boolean, writes: number;
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const path = new URL(req.url ?? "/", "http://fixture.invalid").pathname;
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const input = raw ? JSON.parse(raw) : {};
    if (path === "/auth/signin")
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            accessToken: "fixture-access",
            refreshToken: "fixture-refresh",
            user: {
              id,
              role: companyUser ? "COMPANY_ADMIN" : "PLATFORM_ADMIN",
            },
          },
        }),
      );
    if (path === "/platform/me" && companyUser)
      return res
        .writeHead(403)
        .end(JSON.stringify({ message: "Platform identity required" }));
    if (path === "/auth/session")
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            id,
            name: "Platform fixture",
            email: "platform@example.invalid",
            role: companyUser ? "COMPANY_ADMIN" : "PLATFORM_ADMIN",
            orgId: companyUser ? id : null,
            company: companyUser
              ? { id, name: "Company fixture", currency: "ILS" }
              : null,
          },
        }),
      );
    if (path === "/platform/me")
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            userId: id,
            name: "Platform fixture",
            email: "platform@example.invalid",
            role,
            permissions: {
              manageTeam: role === "SUPER_ADMIN",
              manageCompanies:
                role === "SUPER_ADMIN" || role === "COMPANY_MANAGER",
              managePlans: role === "SUPER_ADMIN",
              manageBilling: role === "SUPER_ADMIN" || role === "BILLING",
              companyOperations: false,
              supportAccess: false,
            },
          },
        }),
      );
    if (path === "/platform/staff")
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            members: [
              {
                id,
                name: "Platform fixture",
                email: "platform@example.invalid",
                role: "SUPER_ADMIN",
                active: true,
              },
            ],
            invitations: [],
          },
        }),
      );
    if (path === "/platform/audit")
      return res.end(JSON.stringify({ success: true, data: { items: [] } }));
    if (path === "/platform/invitations/accept") {
      writes++;
      return res.end(
        JSON.stringify({ success: true, data: { accepted: true } }),
      );
    }
    if (path === "/platform/invitations") {
      writes++;
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            id,
            role: input.role,
            email: input.email,
            activationUrl: `https://example.invalid/platform/activate#token=${"a".repeat(64)}`,
            delivery: "EMAIL",
          },
        }),
      );
    }
    res.writeHead(404).end("{}");
  });
  await new Promise<void>((resolve) =>
    server.listen(3101, "127.0.0.1", resolve),
  );
});
test.afterAll(
  () => new Promise<void>((resolve) => server.close(() => resolve())),
);
test.beforeEach(async ({ context }) => {
  role = "SUPER_ADMIN";
  companyUser = false;
  writes = 0;
  await context.addCookies([
    {
      name: "fleetora_access",
      value: "fixture-access",
      url: "http://localhost:3100",
      httpOnly: true,
    },
    { name: "fleetora_locale", value: "en", url: "http://localhost:3100" },
  ]);
});
test("OD-15 has a separate platform login without company registration", async ({
  page,
}) => {
  await page.goto("/platform/login");
  await expect(
    page.getByRole("heading", { name: "Platform sign in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create an account", exact: true }),
  ).toHaveCount(0);
});
test("OD-15 platform login reaches the console and rejects company credentials", async ({
  page,
}) => {
  companyUser = true;
  await page.goto("/platform/login");
  await page
    .getByLabel("Work email", { exact: true })
    .fill("platform@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("PlatformPass1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "We couldn't sign you in" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/platform\/login$/);
  companyUser = false;
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await page.getByLabel("Password", { exact: true }).fill("PlatformPass1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/platform$/);
  await expect(
    page.getByRole("heading", { name: "Fleetora platform", exact: true }),
  ).toBeVisible();
});
for (const locale of ["en", "ar"] as const)
  test(`OD-15 Super Admin invites staff in ${locale} without company navigation`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "fleetora_locale", value: locale, url: "http://localhost:3100" },
    ]);
    await page.goto("/platform");
    await expect(
      page.getByRole("heading", {
        name: locale === "ar" ? "إدارة منصة Fleetora" : "Fleetora platform",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: /^(Parcels|Merchants|Drivers|الطرود|التجار|السائقون)$/,
      }),
    ).toHaveCount(0);
    await page
      .getByLabel(locale === "ar" ? "البريد الإلكتروني" : "Email", {
        exact: true,
      })
      .fill("support@example.invalid");
    await page
      .getByLabel(locale === "ar" ? "دور المنصة" : "Platform role", {
        exact: true,
      })
      .first()
      .selectOption("SUPPORT");
    await page
      .getByRole("button", {
        name: locale === "ar" ? "إرسال دعوة" : "Send invitation",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: locale === "ar" ? "نسخ رابط التفعيل" : "Copy activation link",
        exact: true,
      }),
    ).toBeVisible();
    expect(writes).toBe(1);
  });
for (const roleName of ["COMPANY_MANAGER", "BILLING", "SUPPORT"])
  test(`OD-15 ${roleName} cannot manage platform staff`, async ({ page }) => {
    role = roleName;
    await page.goto("/platform");
    await expect(
      page.getByRole("heading", { name: "Fleetora platform", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send invitation", exact: true }),
    ).toHaveCount(0);
    expect(writes).toBe(0);
  });
test("OD-15 company identity cannot enter the platform console", async ({
  page,
}) => {
  companyUser = true;
  await page.goto("/platform");
  await expect(
    page.getByRole("alert").filter({ hasText: "Platform access required" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Fleetora platform", exact: true }),
  ).toHaveCount(0);
});
test("OD-15 activation keeps credentials out of URL requests and requires matching passwords", async ({
  page,
}) => {
  const leaks: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("a".repeat(64))) leaks.push(request.url());
  });
  await page.goto(`/platform/activate#token=${"a".repeat(64)}`);
  await page.getByLabel("Full name", { exact: true }).fill("Platform owner");
  await page.getByLabel("Password", { exact: true }).fill("PlatformPass1");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("PlatformPass1");
  await page
    .getByRole("button", { name: "Activate account", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Platform sign in", exact: true }),
  ).toBeVisible();
  expect(leaks).toEqual([]);
  expect(writes).toBe(1);
});
