import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";

// Explicit isolated HTTP fixtures; real database/browser integration lives in backend/test/merchant-browser.ts.
const companyId = "10000000-0000-4000-8000-000000000001";
const merchantId = "10000000-0000-4000-8000-000000000002";
const id = "10000000-0000-4000-8000-000000000003";
const shipmentId = "10000000-0000-4000-8000-000000000004";
const user = {
  id: "workflow-admin",
  name: "Workflow fixture admin",
  email: null,
  role: "COMPANY_ADMIN",
  orgId: companyId,
  company: { id: companyId, name: "Workflow fixture company" },
};
let server: Server;
let status: string,
  error: boolean,
  delay: boolean,
  hasNext: boolean,
  empty: boolean,
  canApprove: boolean,
  changed: boolean;
let writes: { path: string; body: Record<string, unknown> }[];
function pickup() {
  return {
    id,
    companyId,
    merchantId,
    method: "COMPANY_PICKUP",
    status,
    revision: 1,
    pickupAddress: "Fixture pickup address",
    preferredFrom: "2026-11-01T09:00:00Z",
    preferredTo: "2026-11-01T11:00:00Z",
    parcels: [
      {
        id: "10000000-0000-4000-8000-000000000005",
        shipmentId,
        companyId,
        merchantId,
        receipt: "PENDING",
      },
      {
        id: "10000000-0000-4000-8000-000000000006",
        shipmentId: "10000000-0000-4000-8000-000000000007",
        companyId,
        merchantId,
        receipt: "PENDING",
      },
    ],
  };
}
const change = {
  id,
  companyId,
  merchantId,
  shipmentId,
  kind: "AMEND",
  reason: "Fixture address correction",
  createdAt: "2026-10-22T09:00:00Z",
  proposed: { destination: "Fixture proposed address" },
};
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const url = new URL(req.url ?? "/", "http://fixture.invalid");
    const end = (data: unknown) =>
      res.end(JSON.stringify({ success: true, data }));
    if (url.pathname === "/auth/session")
      return end(
        changed
          ? {
              ...user,
              orgId: "other-company",
              company: { id: "other-company", name: "Changed fixture company" },
            }
          : user,
      );
    let raw = "";
    for await (const chunk of req) raw += chunk;
    if (req.method === "POST")
      writes.push({ path: url.pathname, body: raw ? JSON.parse(raw) : {} });
    if (delay) await new Promise((resolve) => setTimeout(resolve, 700));
    if (error)
      return res
        .writeHead(503)
        .end(
          JSON.stringify({ message: "private diagnostic must stay private" }),
        );
    if (url.pathname === "/pickups")
      return end({
        companyId,
        items: empty || url.searchParams.get("page") === "2" ? [] : [pickup()],
        hasNext,
      });
    if (url.pathname === `/pickups/${id}/review`) {
      status = "CONFIRMED";
      return end({ companyId, pickup: pickup() });
    }
    if (url.pathname === `/pickups/${id}/receipts`)
      return end({ companyId, pickup: pickup() });
    if (url.pathname === `/pickups/${id}`)
      return end({ companyId, pickup: pickup() });
    if (url.pathname === "/parcel-requests")
      return end({ companyId, items: empty ? [] : [change] });
    if (url.pathname === `/parcel-requests/${id}/review`)
      return end({ companyId, reviewed: true });
    if (url.pathname === `/parcel-requests/${id}`)
      return end({
        companyId,
        request: change,
        parcel: {
          id: shipmentId,
          companyId,
          merchantId,
          destination: "Fixture current address",
        },
        parcelRevision: 3,
        previousFee: "15.00",
        proposedFee: "18.00",
        currency: "ILS",
        returnFee: "5.00",
        canApprove,
        pricing: {
          pricingVersion: "a".repeat(64),
          finalCustomerAmount: "150.00",
        },
      });
    if (url.pathname === "/merchant-settlement-requests")
      return end({
        companyId,
        items: empty
          ? []
          : [
              {
                id,
                companyId,
                merchantId,
                notes: "Fixture settlement request",
                createdAt: change.createdAt,
              },
            ],
      });
    if (url.pathname === `/merchant-settlement-requests/${id}/review`) {
      empty = true;
      return end({ companyId, reviewed: true });
    }
    if (url.pathname === "/drivers")
      return end({ items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 });
    return res.writeHead(404).end(JSON.stringify({ success: false }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3101, "127.0.0.1", resolve);
  });
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test.beforeEach(async ({ context }) => {
  status = "REQUESTED";
  error = false;
  delay = false;
  hasNext = false;
  empty = false;
  canApprove = true;
  changed = false;
  writes = [];
  await context.addCookies([
    {
      name: "fleetora_access",
      value: "workflow-fixture",
      url: "http://localhost:3100",
      httpOnly: true,
    },
  ]);
});

test("pickup cancellation of the dialog writes nothing, while explicit confirmation submits the reviewed slot", async ({
  page,
}) => {
  await page.goto("/app/pickups");
  await page
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Review pickup request",
    exact: true,
  });
  await expect(dialog.getByText("Fixture pickup address")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(writes).toEqual([]);
  await page
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await dialog
    .getByLabel("Window start", { exact: true })
    .fill("2026-11-01T10:00");
  await dialog
    .getByLabel("Window end", { exact: true })
    .fill("2026-11-01T12:00");
  await dialog
    .getByRole("button", { name: "Save reviewed action", exact: true })
    .click();
  await expect(
    dialog.getByRole("status").filter({ hasText: "Request updated." }),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    path: `/pickups/${id}/review`,
    body: { action: "CONFIRM", revision: 1 },
  });
  expect(writes[0].body).not.toHaveProperty("companyId");
});

test("physical receipt submits only explicitly reviewed parcels and requires discrepancy notes", async ({
  page,
}) => {
  status = "CONFIRMED";
  await page.goto("/app/pickups");
  await page
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Action", { exact: true }).selectOption("RECEIPTS");
  await dialog
    .getByLabel("Receipt result", { exact: true })
    .first()
    .selectOption("MISSING");
  await dialog
    .getByRole("button", { name: "Save reviewed action", exact: true })
    .click();
  expect(writes).toEqual([]);
  await dialog
    .getByLabel("Receipt notes", { exact: true })
    .first()
    .fill("Fixture parcel absent at handoff");
  await dialog
    .getByRole("button", { name: "Save reviewed action", exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({
    path: `/pickups/${id}/receipts`,
    body: {
      revision: 1,
      parcels: [
        {
          parcelId: shipmentId,
          receipt: "MISSING",
          notes: "Fixture parcel absent at handoff",
        },
      ],
    },
  });
});

test("financial preview requires an explicit decision and keeps final collection inclusive", async ({
  page,
}) => {
  await page.goto("/app/requests");
  await page
    .getByRole("button", { name: "Review financial impact", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("150.00 ILS", { exact: true })).toBeVisible();
  await expect(dialog.getByText("18.00 ILS", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Fixture proposed address")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  expect(writes).toEqual([]);
  await dialog
    .getByLabel("Explicit decision", { exact: true })
    .selectOption("APPROVE");
  await dialog
    .getByLabel("Review reason", { exact: true })
    .fill("Reviewed fixture price and address");
  await dialog
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(writes).toEqual([
    {
      path: `/parcel-requests/${id}/review`,
      body: {
        action: "APPROVE",
        parcelRevision: 3,
        pricingVersion: "a".repeat(64),
        reason: "Reviewed fixture price and address",
      },
    },
  ]);
});

test("unavailable approval can be rejected and settlement review never claims payment", async ({
  page,
}) => {
  canApprove = false;
  await page.goto("/app/requests");
  await page
    .getByRole("button", { name: "Review financial impact", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("option", {
      name: "Approve reviewed changes",
      exact: true,
    }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Explicit decision", { exact: true })
    .selectOption("REJECT");
  await dialog
    .getByLabel("Review reason", { exact: true })
    .fill("Current terms unavailable");
  await dialog
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(writes[0].body.action).toBe("REJECT");
  await page
    .getByRole("button", { name: "Mark reviewed", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "No money was paid." }),
  ).toBeVisible();
  expect(writes).toHaveLength(2);
});

test("pickup loading, private-error recovery, and pagination remain usable", async ({
  page,
}) => {
  delay = true;
  error = true;
  await page.goto("/app/pickups");
  await expect(
    page.getByRole("status").filter({ hasText: "Loading pickup requests" }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "temporarily unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByText("private diagnostic must stay private"),
  ).toHaveCount(0);
  error = false;
  delay = false;
  hasNext = true;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Fixture pickup address")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByText("No pickup requests on this page."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByText("Fixture pickup address")).toBeVisible();
});

test("Arabic mobile dialogs fit the viewport and changed sessions hide previous tenant data", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .context()
    .addCookies([
      { name: "fleetora_locale", value: "ar", url: "http://localhost:3100" },
    ]);
  await page.goto("/app/requests");
  await page
    .getByRole("button", { name: "مراجعة الأثر المالي", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByLabel("القرار الصريح", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  expect(writes).toEqual([]);
  changed = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Fixture address correction")).toHaveCount(0);
  expect(writes).toEqual([]);
});
