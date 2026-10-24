import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
const companyId = "10000000-0000-4000-8000-000000000001";
const zoneId = "10000000-0000-4000-8000-000000000002";
const planId = "10000000-0000-4000-8000-000000000003";
const merchantId = "10000000-0000-4000-8000-000000000004";
const admin = {
  id: "10000000-0000-4000-8000-000000000005",
  name: "Pricing admin fixture",
  email: null,
  role: "COMPANY_ADMIN",
  orgId: companyId,
  company: { id: companyId, name: "Pricing fixture company" },
};
const zone = {
  id: zoneId,
  companyId,
  name: "Fixture locality",
  city: "Fixture city",
  baseFee: "15.00",
  currency: "ILS",
  active: true,
  revision: 1,
};
const plan = {
  id: planId,
  companyId,
  name: "Fixture plan",
  currency: "ILS",
  active: true,
  revision: 1,
};
const merchant = {
  id: merchantId,
  companyId,
  name: "Fixture merchant",
  currency: "ILS",
  deliveryFee: "0.00",
  returnFee: "0.00",
  serviceFee: "0.00",
  feePayer: "MERCHANT",
  active: true,
  revision: 1,
};
let server: Server;
let role: string;
let sessionCompany: string;
let errorStatus: number;
let zones: (typeof zone)[];
let plans: (typeof plan)[];
let tariff: Record<string, unknown> | null;
let requests: {
  path: string;
  method: string;
  body: Record<string, unknown>;
  context: string | undefined;
}[];
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body: Record<string, unknown> = raw ? JSON.parse(raw) : {};
    const url = new URL(req.url ?? "/", "http://fixture.invalid");
    const user = {
      ...admin,
      role,
      orgId: role === "PLATFORM_ADMIN" ? null : sessionCompany,
      company:
        role === "PLATFORM_ADMIN"
          ? null
          : { id: sessionCompany, name: admin.company.name },
    };
    if (url.pathname === "/auth/session")
      return res.end(JSON.stringify({ success: true, data: user }));
    requests.push({
      path: url.pathname,
      method: req.method ?? "",
      body,
      context:
        typeof req.headers["x-fleetora-company-context"] === "string"
          ? req.headers["x-fleetora-company-context"]
          : undefined,
    });
    if (errorStatus)
      return res
        .writeHead(errorStatus)
        .end(JSON.stringify({ message: "private diagnostic" }));
    let data: Record<string, unknown> = {};
    if (url.pathname === "/merchant-pricing/zones" && req.method === "GET")
      data = { items: zones, page: 1, pageSize: 25, hasNext: false };
    else if (url.pathname === "/merchant-pricing/plans" && req.method === "GET")
      data = { items: plans, page: 1, pageSize: 25, hasNext: false };
    else if (
      url.pathname === "/merchant-pricing/zones" &&
      req.method === "POST"
    ) {
      zones = [
        {
          ...zone,
          name: String(body.name),
          city: String(body.city),
          baseFee: String(body.baseFee),
        },
      ];
      data = { zone: zones[0] };
    } else if (
      url.pathname === `/merchant-pricing/zones/${zoneId}` &&
      req.method === "PATCH"
    ) {
      zones = [
        {
          ...zone,
          name: String(body.name),
          city: String(body.city),
          baseFee: String(body.baseFee),
          revision: 2,
        },
      ];
      data = { zone: zones[0] };
    } else if (
      url.pathname === "/merchant-pricing/plans" &&
      req.method === "POST"
    ) {
      plans = [{ ...plan, name: String(body.name) }];
      data = { plan: plans[0] };
    } else if (
      url.pathname === `/merchant-pricing/plans/${planId}` &&
      req.method === "GET"
    )
      data = { plan: plans[0] ?? plan, tariffs: tariff ? [tariff] : [] };
    else if (
      url.pathname === `/merchant-pricing/plans/${planId}/tariffs/${zoneId}` &&
      req.method === "PUT"
    ) {
      tariff = {
        id: "10000000-0000-4000-8000-000000000006",
        companyId,
        planId,
        zoneId,
        zoneName: zone.name,
        city: zone.city,
        fee: String(body.fee),
        discount: String(body.discount),
        promotionDiscount: String(body.promotionDiscount),
        promotionLabel: body.promotionLabel ?? null,
      };
      plans = [{ ...plan, revision: 2 }];
      data = { planId, revision: 2, tariff };
    } else if (url.pathname === "/merchants/business")
      data = { items: [merchant], page: 1, pageSize: 25, hasNext: false };
    else if (url.pathname === `/merchants/business/${merchantId}`)
      data = {
        merchant,
        statistics: { total: 0, delivered: 0, returns: 0 },
        balances: [],
      };
    else if (url.pathname === `/merchant-pricing/merchants/${merchantId}/plan`)
      data = {
        merchantId,
        planId: body.planId,
        revision: 2,
        discountAmount: body.discountAmount,
      };
    else return res.writeHead(404).end(JSON.stringify({ success: false }));
    res.end(JSON.stringify({ success: true, data: { companyId, ...data } }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3101, "127.0.0.1", resolve);
  });
});
test.beforeEach(async ({ context }) => {
  role = "COMPANY_ADMIN";
  sessionCompany = companyId;
  errorStatus = 0;
  zones = [{ ...zone }];
  plans = [{ ...plan }];
  tariff = null;
  requests = [];
  await context.addCookies([
    {
      name: "fleetora_access",
      value: "fixture-pricing-access",
      url: "http://localhost:3100",
      httpOnly: true,
    },
    {
      name: "fleetora_refresh",
      value: "fixture-pricing-refresh",
      url: "http://localhost:3100",
      httpOnly: true,
    },
  ]);
});
test.afterAll(async () => {
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("creates and edits a locality with exact fees and keyboard dialog focus", async ({
  page,
}) => {
  zones = [];
  await page.goto("/app/pricing");
  await expect(
    page.getByText("No delivery zones yet.", { exact: false }),
  ).toBeVisible();
  const trigger = page.getByRole("button", { name: "Add zone", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Add zone", exact: true });
  await dialog.getByLabel("Name", { exact: true }).fill(zone.name);
  await dialog.getByLabel("City", { exact: true }).fill(zone.city);
  await dialog.getByLabel("Base delivery fee", { exact: true }).fill("15.00");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Pricing changes saved." }),
  ).toContainText("Pricing changes saved.");
  await expect(
    page.getByRole("cell", { name: zone.name, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Edit: ${zone.name}`, exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "Edit zone", exact: true });
  await edit.getByLabel("Base delivery fee", { exact: true }).fill("16.25");
  await edit
    .getByRole("checkbox", {
      name: "I confirm these commercial terms for future parcels.",
    })
    .check();
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit).not.toBeVisible();
  expect(
    requests.find((request) => request.method === "PATCH")?.body,
  ).toMatchObject({ baseFee: "16.25", revision: 1 });
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
test("creates a plan and saves an explicit named promotion tariff", async ({
  page,
}) => {
  plans = [];
  await page.goto("/app/pricing");
  await page
    .getByRole("button", { name: "Commercial plans", exact: true })
    .click();
  await page.getByRole("button", { name: "Add plan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add plan", exact: true });
  await dialog.getByLabel("Name", { exact: true }).fill(plan.name);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("button", { name: `Zone tariffs: ${plan.name}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save zone tariff", exact: true })
    .click();
  const tariffDialog = page.getByRole("dialog", {
    name: `Zone tariffs: ${plan.name}`,
    exact: true,
  });
  await tariffDialog
    .getByLabel("Destination zone", { exact: true })
    .selectOption(zoneId);
  await tariffDialog
    .getByLabel("Contractual delivery fee (ILS)", { exact: true })
    .fill("17.00");
  await tariffDialog.getByLabel("Plan discount", { exact: true }).fill("1.00");
  await tariffDialog
    .getByLabel("Promotion discount", { exact: true })
    .fill("1.00");
  await tariffDialog
    .getByLabel("Approved promotion name", { exact: true })
    .fill("Approved fixture offer");
  await tariffDialog
    .getByRole("checkbox", {
      name: "I confirm these commercial terms for future parcels.",
    })
    .check();
  await tariffDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(tariffDialog).not.toBeVisible();
  await expect(
    page.getByText("Approved fixture offer", { exact: false }),
  ).toBeVisible();
  expect(
    requests.find((request) => request.method === "PUT")?.body,
  ).toMatchObject({
    revision: 1,
    fee: "17.00",
    discount: "1.00",
    promotionDiscount: "1.00",
  });
});
test("selects a business merchant and assigns a same-currency plan", async ({
  page,
}) => {
  await page.goto("/app/pricing");
  await page
    .getByRole("button", { name: "Merchant plan assignment", exact: true })
    .click();
  await page.getByLabel("Merchant", { exact: true }).selectOption(merchantId);
  await page.getByRole("button", { name: "Assign plan", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: `Assign plan: ${merchant.name}`,
    exact: true,
  });
  await dialog
    .getByLabel("Commercial plan", { exact: true })
    .selectOption(planId);
  await dialog
    .getByLabel("Additional merchant discount", { exact: true })
    .fill("0.25");
  await dialog
    .getByRole("checkbox", {
      name: "I confirm these commercial terms for future parcels.",
    })
    .check();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    requests.find((request) =>
      request.path.includes(`/merchants/${merchantId}/plan`),
    )?.body,
  ).toEqual({ planId, revision: 1, discountAmount: "0.25" });
});
test("supports Arabic RTL and a narrow viewport without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/pricing");
  await expect(
    page.getByRole("heading", {
      name: "Delivery pricing",
      level: 2,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page
    .getByRole("menuitemradio", { name: "Switch language to Arabic" })
    .click();
  await expect(
    page.getByRole("heading", { name: "تسعير التوصيل", level: 2, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "إضافة منطقة", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "إضافة منطقة", exact: true });
  await expect(dialog).toHaveAttribute("dir", "rtl");
  await expect(
    dialog.getByLabel("رسوم التوصيل الأساسية", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("shows safe errors with retry and prevents stale-company mutation", async ({
  page,
}) => {
  errorStatus = 503;
  await page.goto("/app/pricing");
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("private diagnostic");
  errorStatus = 0;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: zone.name, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add zone", exact: true });
  await dialog.getByLabel("Name", { exact: true }).fill("Will not save");
  await dialog.getByLabel("City", { exact: true }).fill("Fixture city");
  await dialog.getByLabel("Base delivery fee", { exact: true }).fill("1");
  sessionCompany = "10000000-0000-4000-8000-000000000099";
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "company session changed",
  );
  expect(requests.filter((request) => request.method !== "GET")).toHaveLength(
    0,
  );
});
for (const denied of ["PLATFORM_ADMIN", "ACCOUNTANT", "MERCHANT"])
  test(`denies pricing management for ${denied}`, async ({ page }) => {
    role = denied;
    await page.goto("/app/pricing");
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    expect(requests).toHaveLength(0);
  });
