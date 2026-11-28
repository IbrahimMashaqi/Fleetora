import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { typeWithoutNavigation } from "@/tests/focus-retention";
import { contrastRatio } from "@/tests/ui-assertions";
const companyId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const base = {
  id: companyId,
  name: "أحمد للنقل",
  phone: "0591234567",
  address: "Company address",
  approvalStatus: "PENDING",
  suspended: false,
  status: "PENDING",
  rejectionReason: null as string | null,
  currency: "ILS",
  plan: "TRIAL",
  revision: 1,
  createdAt: "2026-11-27T00:00:00Z",
  updatedAt: "2026-11-27T00:00:00Z",
};
let server: Server,
  company: typeof base,
  platformRole: string,
  companyUser: boolean,
  writes: { path: string; body: Record<string, unknown> }[],
  searches: string[];
let events: {
  id: string;
  action: string;
  createdAt: string;
  details: { reason?: string };
}[];
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const url = new URL(req.url ?? "/", "http://fixture.invalid");
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    if (url.pathname === "/auth/session")
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            id: userId,
            name: "Company administrator",
            email: "admin@example.invalid",
            role: companyUser ? "COMPANY_ADMIN" : "PLATFORM_ADMIN",
            orgId: companyUser ? companyId : null,
            company: companyUser
              ? {
                  id: companyId,
                  name: company.name,
                  currency: "ILS",
                  approvalStatus: company.approvalStatus,
                }
              : null,
          },
        }),
      );
    if (url.pathname === "/platform/me")
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            userId,
            name: "Platform fixture",
            email: "platform@example.invalid",
            role: platformRole,
          },
        }),
      );
    if (req.method !== "GET") writes.push({ path: url.pathname, body });
    if (url.pathname === "/platform/companies" && req.method === "GET") {
      searches.push(url.searchParams.get("search") ?? "");
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            items: [company],
            page: Number(url.searchParams.get("page") ?? 1),
            pageSize: 25,
            hasNext: false,
          },
        }),
      );
    }
    if (url.pathname === "/platform/companies" && req.method === "POST")
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            company: { ...company, name: body.name, approvalStatus: "ACTIVE" },
            delivery: "EMAIL",
            activationUrl: `https://example.invalid/company/activate#token=${"a".repeat(64)}`,
          },
        }),
      );
    if (url.pathname === `/platform/companies/${companyId}/transitions`) {
      company.revision++;
      events.push({
        id: String(company.revision),
        action: `COMPANY_${String(body.action).toUpperCase()}`,
        createdAt: "2026-11-27T00:00:00Z",
        details: { reason: body.reason },
      });
      if (body.action === "approve") company.approvalStatus = "ACTIVE";
      if (body.action === "reject") {
        company.approvalStatus = "REJECTED";
        company.rejectionReason = body.reason;
      }
      if (body.action === "suspend") company.suspended = true;
      if (body.action === "reactivate") company.suspended = false;
      company.status = company.suspended ? "SUSPENDED" : company.approvalStatus;
      return res.end(JSON.stringify({ success: true, data: { company } }));
    }
    if (url.pathname === `/platform/companies/${companyId}`)
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            company,
            primaryAdminId: userId,
            admins: [
              {
                id: userId,
                name: "Primary admin",
                email: "admin@example.invalid",
                active: true,
                verified: true,
              },
            ],
            events,
          },
        }),
      );
    if (
      url.pathname === "/company/status" ||
      url.pathname === "/company/profile"
    ) {
      if (req.method === "PATCH") {
        company.name = body.name;
        company.phone = body.phone;
        company.address = body.address;
        company.revision++;
      }
      return res.end(JSON.stringify({ success: true, data: { company } }));
    }
    if (url.pathname === "/company/status/resubmit") {
      company = {
        ...company,
        name: body.name,
        phone: body.phone,
        address: body.address,
        approvalStatus: "PENDING",
        rejectionReason: null,
        revision: company.revision + 1,
      };
      return res.end(JSON.stringify({ success: true, data: { company } }));
    }
    if (url.pathname === "/company/admin-invitations/accept")
      return res.end(
        JSON.stringify({ success: true, data: { accepted: true } }),
      );
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
  company = { ...base };
  platformRole = "SUPER_ADMIN";
  companyUser = false;
  writes = [];
  searches = [];
  events = [];
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
for (const locale of ["en", "ar"] as const)
  test(`Companies platform directory and direct primary-admin creation in ${locale}`, async ({
    page,
    context,
  }) => {
    if (locale === "ar")
      await page.setViewportSize({ width: 390, height: 844 });
    await context.addCookies([
      { name: "fleetora_locale", value: locale, url: "http://localhost:3100" },
    ]);
    await page.goto("/platform/companies");
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "ar" ? "rtl" : "ltr",
    );
    await expect(
      page.getByRole("heading", {
        name: locale === "ar" ? "الشركات" : "Companies",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: locale === "ar" ? "إنشاء شركة" : "Create company",
        exact: true,
      })
      .click();
    await page
      .getByLabel(locale === "ar" ? "اسم الشركة" : "Company name", {
        exact: true,
      })
      .fill("New company");
    await page
      .getByLabel(
        locale === "ar" ? "اسم المدير الأساسي" : "Primary admin name",
        { exact: true },
      )
      .fill("New admin");
    await page
      .getByLabel(
        locale === "ar" ? "بريد المدير الأساسي" : "Primary admin email",
        { exact: true },
      )
      .fill("new@example.invalid");
    await page
      .getByRole("button", {
        name:
          locale === "ar"
            ? "إنشاء وإرسال الدعوة"
            : "Create and send invitation",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: locale === "ar" ? "نسخ رابط التفعيل" : "Copy activation link",
        exact: true,
      }),
    ).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0].body).not.toHaveProperty("password");
  });
for (const locale of ["en", "ar"] as const)
  test(`Pending company sees only status and rejected admin edits/resubmits in ${locale}`, async ({
    page,
    context,
  }) => {
    companyUser = true;
    await context.addCookies([
      { name: "fleetora_locale", value: locale, url: "http://localhost:3100" },
    ]);
    await page.goto("/app/parcels");
    await expect(
      page.getByRole("heading", {
        name:
          locale === "ar"
            ? "شركتك بانتظار الموافقة"
            : "Your company is awaiting approval",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", {
        name: locale === "ar" ? "التنقل الرئيسي" : "Primary navigation",
      }),
    ).toHaveCount(0);
    const signOut = page.getByRole("button", {
      name: locale === "ar" ? "تسجيل الخروج" : "Log out",
      exact: true,
    });
    await expect(signOut).toBeVisible();
    expect(await contrastRatio(signOut)).toBeGreaterThanOrEqual(4.5);
    company.approvalStatus = "REJECTED";
    company.rejectionReason = "Confirm address";
    company.revision = 2;
    await page.reload();
    await expect(
      page.getByText("Confirm address", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel(locale === "ar" ? "اسم الشركة" : "Company name", {
        exact: true,
      })
      .fill("Corrected company");
    await page
      .getByRole("button", {
        name: locale === "ar" ? "تعديل وإعادة تقديم" : "Save and resubmit",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name:
          locale === "ar"
            ? "شركتك بانتظار الموافقة"
            : "Your company is awaiting approval",
        exact: true,
      }),
    ).toBeVisible();
    expect(writes.at(-1)?.path).toBe("/company/status/resubmit");
  });
for (const locale of ["en", "ar"] as const)
  test(`platform header language and sign-out controls are readable on navy in ${locale}`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "fleetora_locale", value: locale, url: "http://localhost:3100" },
    ]);
    await page.goto("/platform/companies");
    const language = page
      .getByRole("banner")
      .getByRole("button", { name: locale === "ar" ? "اللغة" : "Language" });
    await expect(language).toBeVisible();
    expect(await contrastRatio(language)).toBeGreaterThanOrEqual(4.5);
    expect(
      await contrastRatio(
        page.getByRole("button", {
          name: locale === "ar" ? "تسجيل الخروج" : "Log out",
        }),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });
test("company search keeps focus, fetches suggestions/results and never navigates while typing", async ({
  page,
}) => {
  await page.goto("/platform/companies");
  const input = page.getByRole("searchbox", {
    name: "Search companies",
    exact: true,
  });
  await typeWithoutNavigation(page, input);
  await expect.poll(() => searches.at(-1)).toBe("مح");
  expect(writes).toHaveLength(0);
});
test("Company manager can approve; Support can read without actions; Billing is denied", async ({
  page,
}) => {
  platformRole = "COMPANY_MANAGER";
  await page.goto(`/platform/companies/${companyId}`);
  await page
    .getByRole("button", { name: "Approve company", exact: true })
    .click();
  const confirm = page.getByRole("dialog", { name: "Approve company" });
  await expect(confirm).toBeVisible();
  expect(writes).toHaveLength(0);
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toBeHidden();
  expect(writes).toHaveLength(0);
  await page
    .getByRole("button", { name: "Approve company", exact: true })
    .click();
  await confirm
    .getByRole("button", { name: "Confirm approval", exact: true })
    .click();
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Company approved." }),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  platformRole = "SUPPORT";
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Company details", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Suspend company", exact: true }),
  ).toHaveCount(0);
  platformRole = "BILLING";
  await page.reload();
  await expect(
    page.getByRole("alert").filter({ hasText: "permission" }),
  ).toBeVisible();
});
test("suspension requires a reason and records the selected revision", async ({
  page,
}) => {
  company.approvalStatus = "ACTIVE";
  company.status = "ACTIVE";
  await page.goto(`/platform/companies/${companyId}`);
  await page
    .getByRole("button", { name: "Suspend company", exact: true })
    .click();
  expect(writes).toHaveLength(0);
  await page.getByLabel("Reason", { exact: true }).fill("Security review");
  await page
    .getByRole("button", { name: "Confirm suspend", exact: true })
    .click();
  await expect(
    page.getByText("Suspended", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Security review", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Company suspended." }),
  ).toBeVisible();
  expect(writes[0].body).toMatchObject({
    action: "suspend",
    reason: "Security review",
    revision: 1,
  });
});
test("company settings submits only basic profile fields and shows currency/plan read-only", async ({
  page,
}) => {
  companyUser = true;
  company.approvalStatus = "ACTIVE";
  await page.goto("/app/settings");
  await page
    .getByLabel("Company name", { exact: true })
    .fill("Updated company");
  await page
    .getByRole("button", { name: "Save company profile", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "saved" }),
  ).toBeVisible();
  expect(writes[0].body).toEqual({
    name: "Updated company",
    phone: base.phone,
    address: base.address,
    revision: 1,
  });
});
for (const locale of ["en", "ar"] as const)
  test(`primary admin activation uses fragment and POST body only in ${locale}`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "fleetora_locale", value: locale, url: "http://localhost:3100" },
    ]);
    const token = "b".repeat(64);
    let leaked = false;
    page.on("request", (request) => {
      if (request.url().includes(token)) leaked = true;
    });
    await page.goto(`/company/activate#token=${token}`);
    await page
      .getByLabel(locale === "ar" ? "الاسم الكامل" : "Full name", {
        exact: true,
      })
      .fill("Primary admin");
    await page
      .getByLabel(locale === "ar" ? "كلمة المرور" : "Password", { exact: true })
      .fill("CompanyPass1");
    await page
      .getByLabel(locale === "ar" ? "تأكيد كلمة المرور" : "Confirm password", {
        exact: true,
      })
      .fill("CompanyPass1");
    await page
      .getByRole("button", {
        name: locale === "ar" ? "تفعيل الحساب" : "Activate account",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("link", {
        name: locale === "ar" ? "الانتقال إلى تسجيل الدخول" : "Go to sign in",
        exact: true,
      }),
    ).toBeVisible();
    expect(leaked).toBe(false);
  });
