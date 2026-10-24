import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { translate } from "@/lib/i18n";

const companyId = "10000000-0000-4000-8000-000000000001";
const user = {
  id: "10000000-0000-4000-8000-000000000002",
  name: "Fictional company administrator",
  email: null,
  role: "COMPANY_ADMIN",
  orgId: companyId,
  company: { id: companyId, name: "Fictional delivery company" },
};
const capabilities = Object.fromEntries(
  [
    "view",
    "manageMerchants",
    "manageParcels",
    "manageReturns",
    "collect",
    "remit",
    "viewFinance",
    "createSettlements",
    "approveSettlements",
    "paySettlements",
  ].map((key) => [key, true]),
);
let backend: Server;
const merchantId = "10000000-0000-4000-8000-000000000010",
  parcelId = "10000000-0000-4000-8000-000000000011",
  driverId = "10000000-0000-4000-8000-000000000012",
  settlementId = "10000000-0000-4000-8000-000000000013",
  collectionId = "10000000-0000-4000-8000-000000000014";
const timestamp = "2026-10-21T10:00:00Z";
const merchant = {
  id: merchantId,
  companyId,
  name: "Fictional Parcel Merchant",
  contactName: "Fictional Contact",
  phone: "+000000001",
  secondaryPhone: null,
  pickupAddress: "Fictional pickup",
  city: "Fictional city",
  latitude: null,
  longitude: null,
  notes: null,
  active: true,
  currency: "ILS",
  deliveryFee: "15.00",
  feePayer: "MERCHANT",
  returnFee: "5.00",
  returnFeePolicy: "ON_MERCHANT_HANDOFF",
  serviceFee: "2.00",
  paymentNotes: null,
  revision: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const parcel = {
  id: parcelId,
  companyId,
  trackingNumber: "FL-ISOLATED-UI",
  merchantId,
  merchantReference: "FICTIONAL-ORDER",
  recipientName: "Fictional Recipient",
  recipientPhone: "+000000002",
  city: "Fictional city",
  destination: "Fictional destination",
  description: "Fictional test goods",
  pieces: 1,
  codAmount: "100.00",
  deliveryFee: "15.00",
  returnFee: "5.00",
  serviceFee: "2.00",
  feePayer: "MERCHANT",
  expectedCustomerTotal: "100.00",
  currency: "ILS",
  priority: "NORMAL",
  workerId: driverId,
  status: "OUT_FOR_DELIVERY",
  custody: "DRIVER",
  locationLabel: "Fictional warehouse handoff",
  locationSource: "MANUAL_HANDOFF",
  locationUpdatedAt: timestamp,
  attemptCount: 0,
  revision: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const collection = {
  id: collectionId,
  companyId,
  shipmentId: parcelId,
  merchantId,
  workerId: driverId,
  currency: "ILS",
  amount: "100.00",
  goodsAmount: "100.00",
  method: "CASH",
  reference: "Fixture receipt",
  recordedBy: user.id,
  collectedAt: timestamp,
  remittedAt: null,
};
const lines = [
  {
    id: "10000000-0000-4000-8000-000000000020",
    shipmentId: parcelId,
    kind: "GOODS",
    amount: "100.00",
    reason: "Fixture goods",
  },
  {
    id: "10000000-0000-4000-8000-000000000021",
    shipmentId: parcelId,
    kind: "DELIVERY_FEE",
    amount: "-17.00",
    reason: "Fixture fee",
  },
];
const settlement = {
  id: settlementId,
  companyId,
  merchantId,
  currency: "ILS",
  status: "FINALIZED",
  grossCollected: "100.00",
  deliveryFees: "17.00",
  returnFees: "0.00",
  adjustments: "0.00",
  netPayable: "83.00",
  revision: 2,
  createdAt: timestamp,
  lines,
  payments: [],
};
let balanceAmount: string;
let parcelOverride: Record<string, unknown>;
let returnedFixture: Record<string, unknown> | null;
let activeRole: string;
let status: number;
let empty: boolean;
let delay: number;
let uncertain: boolean;
let writes: { path: string; body: Record<string, unknown> }[];
test.beforeAll(async () => {
  backend = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/auth/session")
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            ...user,
            role: activeRole,
            ...(activeRole === "PLATFORM_ADMIN"
              ? { orgId: null, company: null }
              : {}),
          },
        }),
      );
    if (req.url === "/parcels/config")
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            companyId,
            capabilities,
            transitions: {},
            currencies: ["ILS", "USD", "EUR", "JOD"],
          },
        }),
      );
    const url = new URL(req.url ?? "/", "http://fixture.invalid");
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    if (req.method !== "GET") {
      writes.push({ path: url.pathname, body });
      if (url.pathname === "/financial/adjustments") balanceAmount = "93.00";
      if (uncertain) {
        req.socket.destroy();
        return;
      }
    }
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (status !== 200)
      return res.writeHead(status).end(
        JSON.stringify({
          message: "private fixture infrastructure diagnostic",
        }),
      );
    let data: Record<string, unknown> = {};
    if (url.pathname === "/settlements/preview")
      data = {
        preview: {
          merchantId,
          currency: "ILS",
          grossCollected: "100.00",
          deliveryFees: "17.00",
          returnFees: "0.00",
          adjustments: "0.00",
          netPayable: "83.00",
          previewHash: "a".repeat(64),
          lines,
        },
      };
    else if (req.method !== "GET")
      data =
        url.pathname === "/financial/adjustments"
          ? {
              entry: {
                id: "10000000-0000-4000-8000-000000000060",
                companyId,
                merchantId,
                currency: "ILS",
                kind: "ADJUSTMENT",
                amount: "10.00",
              },
            }
          : url.pathname.startsWith("/merchants")
            ? { merchant: { ...merchant, ...body } }
            : url.pathname.startsWith("/settlements")
              ? { settlement: { ...settlement, status: "PAID" } }
              : url.pathname.startsWith("/collections")
                ? { collection }
                : { parcel };
    else if (url.pathname === `/merchants/business/${merchantId}`)
      data = {
        merchant,
        statistics: { total: 1, delivered: 0, returns: 0 },
        balances: [
          {
            currency: "ILS",
            balance: balanceAmount,
            eligible: balanceAmount,
            paid: "0.00",
          },
        ],
      };
    else if (url.pathname === `/parcels/${parcelId}`)
      data = {
        parcel: { ...parcel, ...parcelOverride },
        merchant,
        worker: {
          id: driverId,
          fullName: "Fictional Driver",
          phone: "+000000003",
          status: "ACTIVE",
        },
        collection: null,
        returnRecord: returnedFixture,
        events: [],
        attempts: [],
        allowedTransitions: [
          "DELIVERED",
          "FAILED_DELIVERY",
          "RETURN_IN_PROGRESS",
        ],
      };
    else if (url.pathname === `/settlements/${settlementId}`)
      data = { settlement };
    else if (url.pathname === "/parcel-operations/dashboard")
      data = {
        counts: {
          total: 1,
          new: 0,
          atWarehouse: 0,
          assigned: 0,
          outForDelivery: 1,
          delivered: 0,
          failedDeliveries: 0,
          pendingReturns: 0,
          returnedToMerchant: 0,
          overdue: 0,
        },
        statusDistribution: [{ status: "OUT_FOR_DELIVERY", count: 1 }],
        recentActivity: [],
        attention: [],
        pendingReturns: [],
        money: [],
      };
    else {
      const page = Number(url.searchParams.get("page") ?? 1),
        pageSize = Number(url.searchParams.get("pageSize") ?? 25);
      const rows =
        empty || url.searchParams.get("search") === "missing"
          ? []
          : url.pathname === "/merchants/business"
            ? [merchant]
            : url.pathname === "/parcels"
              ? [
                  {
                    ...parcel,
                    trackingNumber:
                      page === 1 ? parcel.trackingNumber : "FL-PAGE-TWO",
                  },
                ]
              : url.pathname === "/parcels/drivers"
                ? [
                    {
                      id: driverId,
                      companyId,
                      fullName: "Fictional Driver",
                      status: "ACTIVE",
                    },
                  ]
                : url.pathname === "/collections"
                  ? [collection]
                  : url.pathname === "/settlements"
                    ? [settlement]
                    : url.pathname.endsWith("/events")
                      ? [
                          {
                            id: "10000000-0000-4000-8000-000000000030",
                            shipmentId: parcelId,
                            event: "PARCEL_CREATED",
                            actorId: user.id,
                            fromStatus: "CREATED",
                            toStatus: "CREATED",
                            note: "Fictional parcel received",
                            custody: "MERCHANT",
                            occurredAt: timestamp,
                          },
                        ]
                      : [];
      data = {
        items: rows,
        page,
        pageSize,
        hasNext: !empty && page === 1 && url.pathname === "/parcels",
      };
    }
    return res.end(
      JSON.stringify({ success: true, data: { companyId, ...data } }),
    );
  });
  await new Promise<void>((resolve) =>
    backend.listen(3101, "127.0.0.1", resolve),
  );
});
test.afterAll(async () => {
  backend.closeAllConnections();
  await new Promise<void>((resolve) => backend.close(() => resolve()));
});
test.beforeEach(async ({ context }) => {
  balanceAmount = "83.00";
  parcelOverride = {};
  returnedFixture = null;
  activeRole = "COMPANY_ADMIN";
  status = 200;
  empty = false;
  delay = 0;
  uncertain = false;
  writes = [];
  await context.addCookies([
    {
      name: "fleetora_access",
      value: "isolated-operations-fixture",
      url: "http://localhost:3100",
      httpOnly: true,
    },
  ]);
});

test("company admin opens business merchant creation and cancellation makes no change", async ({
  page,
}) => {
  await page.goto("/app/merchants");
  await page
    .getByRole("button", { name: "Create merchant", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Create merchant",
    exact: true,
  });
  await expect(
    dialog.getByLabel("Business name", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toHaveLength(0);
});

test("merchant form submits real contact and commercial fields without tenant ownership", async ({
  page,
}) => {
  await page.goto("/app/merchants");
  await page
    .getByRole("button", { name: "Create merchant", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Create merchant",
    exact: true,
  });
  await dialog
    .getByLabel("Business name", { exact: true })
    .fill("Fictional UI business");
  await dialog
    .getByLabel("Contact person", { exact: true })
    .fill("Fictional contact");
  await dialog.getByLabel("Phone", { exact: true }).fill("+000000004");
  await dialog
    .getByLabel("Pickup address", { exact: true })
    .fill("Fictional pickup address");
  await dialog
    .getByLabel("City / region", { exact: true })
    .fill("Fictional city");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/merchants/${merchantId}$`));
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({
    name: "Fictional UI business",
    feePayer: "MERCHANT",
    deliveryFee: "0.00",
    active: true,
  });
  expect(writes[0].body).not.toHaveProperty("companyId");
});
test("parcel creation submits recipient, merchant and customer notes", async ({
  page,
}) => {
  await page.goto("/app/parcels");
  await page
    .getByRole("button", { name: "Create parcel", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Create parcel",
    exact: true,
  });
  await dialog
    .getByLabel("Merchants", { exact: true })
    .selectOption(merchantId);
  for (const [label, value] of [
    ["Recipient name", "Fictional UI recipient"],
    ["Recipient phone", "+000000009"],
    ["City / region", "Fictional city"],
    ["Delivery address", "Fictional recipient address"],
    ["Parcel description", "Fictional goods"],
  ])
    await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog
    .getByRole("textbox", { name: /^Customer notes/ })
    .fill("Call on arrival");
  await dialog.getByLabel("COD goods amount", { exact: true }).fill("100.00");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/parcels/${parcelId}$`));
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    path: "/parcels",
    body: {
      merchantId,
      recipientName: "Fictional UI recipient",
      customerNotes: "Call on arrival",
      codAmount: "100.00",
      pieces: 1,
    },
  });
  expect(writes[0].body).not.toHaveProperty("companyId");
});
test("Other return reason requires explanation before sending", async ({
  page,
}) => {
  await page.goto(`/app/parcels/${parcelId}`);
  await page
    .getByRole("button", { name: "Initiate return", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Initiate return",
    exact: true,
  });
  await dialog
    .getByLabel("Return reason", { exact: true })
    .selectOption("OTHER");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  expect(writes).toHaveLength(0);
  await expect(dialog.getByLabel("Note", { exact: true })).toHaveAttribute(
    "required",
    "",
  );
  await dialog
    .getByLabel("Note", { exact: true })
    .fill("Fictional recipient moved away");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0]).toMatchObject({
    path: "/returns",
    body: {
      parcelId,
      revision: 1,
      reason: "OTHER",
      note: "Fictional recipient moved away",
    },
  });
});

test("zero-COD delivered parcel hides collection when the backend says no money is due", async ({ page }) => {
  parcelOverride = { status: "DELIVERED", codAmount: "0.00", expectedCustomerTotal: "0.00", collectionRequired: false };
  await page.goto(`/app/parcels/${parcelId}`);
  await expect(page.getByRole("heading", { name: "Parcel details", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record COD collection", exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(0);
});

test("zero goods COD still offers collection when the backend requires customer-paid charges", async ({ page }) => {
  parcelOverride = { status: "DELIVERED", codAmount: "0.00", expectedCustomerTotal: "17.00", collectionRequired: true };
  await page.goto(`/app/parcels/${parcelId}`);
  await page.getByRole("button", { name: "Record COD collection", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Amount", { exact: true })).toHaveValue("17.00");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes).toHaveLength(0);
});

test("parcel search and pagination preserve URL filters", async ({ page }) => {
  await page.goto("/app/parcels");
  await expect(page.getByText("FL-ISOLATED-UI", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText("FL-PAGE-TWO", { exact: true })).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search parcels", exact: true })
    .fill("missing");
  await expect(page).toHaveURL(/search=missing/);
  await expect(
    page.getByText("No records match these filters.", { exact: true }),
  ).toBeVisible();
});
test("parcel details display persisted custody and timeline; return cancellation records nothing", async ({
  page,
}) => {
  await page.goto(`/app/parcels/${parcelId}`);
  await expect(
    page.getByText("Fictional warehouse handoff", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Fictional parcel received", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Fictional Driver", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Initiate return", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Initiate return",
    exact: true,
  });
  await dialog
    .getByLabel("Return reason", { exact: true })
    .selectOption("OTHER");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes).toHaveLength(0);
});
test("financial uncertainty prevents duplicate submission and exposes no infrastructure details", async ({
  page,
}) => {
  uncertain = true;
  await page.goto("/app/collections");
  await page
    .getByRole("button", { name: "Record cash remittance", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Record cash remittance",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "The result is uncertain.",
  );
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  expect(writes).toHaveLength(1);
  await expect(page.locator("body")).not.toContainText(
    "private fixture infrastructure diagnostic",
  );
});
test("settlement preview is itemized and draft creation requires explicit confirmation", async ({
  page,
}) => {
  await page.goto("/app/settlements/new");
  const dialog = page.getByRole("dialog", {
    name: "Preview settlement",
    exact: true,
  });
  await dialog
    .getByLabel("Merchants", { exact: true })
    .selectOption(merchantId);
  await dialog
    .getByRole("button", { name: "Preview settlement", exact: true })
    .click();
  await expect(page.getByText("83.00 ILS", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  await page
    .getByRole("button", { name: "Create settlement draft", exact: true })
    .click();
  const confirm = page.getByRole("dialog", {
    name: "Create settlement draft",
    exact: true,
  });
  await expect(confirm).toContainText(
    "This action creates a permanent financial audit record.",
  );
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes).toHaveLength(1);
});
test("actual merchant payout has its own confirmation, amount and payment reference", async ({
  page,
}) => {
  await page.goto(`/app/settlements/${settlementId}`);
  await page
    .getByRole("button", { name: "Record merchant payout", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Record merchant payout",
    exact: true,
  });
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveValue(
    "83.00",
  );
  await dialog
    .getByLabel("Payment reference", { exact: true })
    .fill("FICTIONAL-PAYMENT-RECEIPT");
  await dialog
    .getByLabel("Actual payment date", { exact: true })
    .fill("2026-10-21T12:00");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0]).toMatchObject({
    path: `/settlements/${settlementId}/payment`,
    body: {
      revision: 2,
      amount: "83.00",
      reference: "FICTIONAL-PAYMENT-RECEIPT",
    },
  });
  expect(writes[0].body.idempotencyKey).toEqual(expect.any(String));
});
test("loading, empty and unavailable operations stay distinct", async ({
  page,
}) => {
  delay = 800;
  empty = true;
  await page.goto("/app/parcels");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Loading operations..." })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText("No parcels yet.", { exact: true }),
  ).toBeVisible();
  status = 503;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Operations are temporarily unavailable." })
      .first(),
  ).toBeVisible();
  await expect(page.getByText("No parcels yet.", { exact: true })).toHaveCount(
    0,
  );
});
for (const role of ["MERCHANT", "PLATFORM_ADMIN"])
  test(`${role} cannot open parcel operations or dispatch tenant reads`, async ({
    page,
  }) => {
    activeRole = role;
    await page.goto("/app/parcels");
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Your account cannot perform this operation." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create parcel", exact: true }),
    ).toHaveCount(0);
  });
for (const locale of ["en", "ar"] as const)
  for (const mobile of [false, true])
    test(`operations tables and forms render in ${locale} on ${mobile ? "mobile" : "desktop"}`, async ({
      page,
      context,
    }, testInfo) => {
      await context.addCookies([
        {
          name: "fleetora_locale",
          value: locale,
          url: "http://localhost:3100",
        },
      ]);
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      );
      const t = (key: Parameters<typeof translate>[1]) =>
        translate(locale, key);
      await page.goto("/app/parcels");
      await expect(
        page.getByText("FL-ISOLATED-UI", { exact: true }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      await page
        .getByRole("button", { name: t("Create parcel"), exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: t("Create parcel"),
        exact: true,
      });
      await expect(
        dialog.getByLabel(t("Recipient name"), { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(
          `operations-${locale}-${mobile ? "mobile" : "desktop"}.png`,
        ),
        fullPage: true,
      });
      const viewport = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        overflowing: Array.from(document.querySelectorAll("body *"))
          .filter(
            (element) =>
              element.getBoundingClientRect().right > innerWidth + 1 &&
              element.getBoundingClientRect().width > 0,
          )
          .slice(0, 14)
          .map((element) => ({
            tag: element.tagName,
            class: element.className,
            x: element.getBoundingClientRect().x,
            width: element.getBoundingClientRect().width,
            position: getComputedStyle(element).position,
          })),
      }));
      expect(
        viewport.scrollWidth,
        JSON.stringify(viewport),
      ).toBeLessThanOrEqual(viewport.width);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    });

test("merchant balances refresh after an audited adjustment", async ({
  page,
}) => {
  await page.goto(`/app/merchants/${merchantId}`);
  const balances = page.getByRole("region", { name: /Outstanding balance/ });
  await expect(
    balances.getByText("83.00 ILS", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record adjustment", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Record adjustment",
    exact: true,
  });
  await dialog.getByLabel("Adjustment amount", { exact: true }).fill("10.00");
  await dialog
    .getByLabel("Reason", { exact: true })
    .fill("Fictional audited correction");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    balances.getByText("93.00 ILS", { exact: true }).first(),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
});
test("settlement preview identifies each included parcel", async ({ page }) => {
  await page.goto("/app/settlements/new");
  const dialog = page.getByRole("dialog", {
    name: "Preview settlement",
    exact: true,
  });
  await dialog
    .getByLabel("Merchants", { exact: true })
    .selectOption(merchantId);
  await dialog
    .getByRole("button", { name: "Preview settlement", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: parcelId, exact: true }).first(),
  ).toHaveAttribute("href", `/app/parcels/${parcelId}`);
});
test("waived return fees display the effective zero charge", async ({
  page,
}) => {
  parcelOverride = {
    status: "RETURNED_TO_MERCHANT",
    custody: "MERCHANT",
    returnFee: "5.00",
    returnFeePolicy: "NONE",
  };
  returnedFixture = {
    id: "10000000-0000-4000-8000-000000000070",
    companyId,
    shipmentId: parcelId,
    status: "RETURNED_TO_MERCHANT",
    reason: "UNREACHABLE",
  };
  await page.goto(`/app/parcels/${parcelId}`);
  const panel = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Returns", exact: true }),
    });
  await expect(
    panel.getByText("No return charge", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText("0.00 ILS", { exact: true })).toBeVisible();
});
test("custody form offers only backend-supported handoff targets", async ({
  page,
}) => {
  await page.goto(`/app/parcels/${parcelId}`);
  await page
    .getByRole("button", { name: "Record custody / location", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Record custody / location",
    exact: true,
  });
  await expect(
    dialog.getByRole("option", { name: "Merchant custody", exact: true }),
  ).toHaveCount(0);
});
