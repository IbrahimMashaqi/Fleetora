import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { pickupsForSession } from "./pickups.server";
import { requestsForSession } from "@/features/merchant-requests/requests.server";
const companyId = "10000000-0000-4000-8000-000000000001",
  merchantId = "10000000-0000-4000-8000-000000000002",
  id = "10000000-0000-4000-8000-000000000003",
  shipmentId = "10000000-0000-4000-8000-000000000004";
const scope = { userId: "operator", companyId },
  jar = {
    get: (name: string) =>
      name.includes("access") ? { value: "fixture-access" } : undefined,
    set() {},
    delete() {},
  };
let server: Server,
  previous: string | undefined,
  role: string,
  sessionCompany: string,
  status: number,
  body: unknown;
let requests: { method: string; path: string; body: unknown }[];
const pickup = {
  id,
  companyId,
  merchantId,
  method: "COMPANY_PICKUP",
  status: "REQUESTED",
  revision: 1,
  pickupAddress: "Fixture alternate address",
  parcels: [],
  privateSecret: "must-not-reach-client",
};
test.beforeAll(async () => {
  previous = process.env.FLEETORA_API_URL;
  server = createServer(async (req, res) => {
    let input = "";
    for await (const chunk of req) input += chunk;
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/auth/session")
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            id: scope.userId,
            name: "Fixture operator",
            email: null,
            role,
            orgId: role === "PLATFORM_ADMIN" ? null : sessionCompany,
            company:
              role === "PLATFORM_ADMIN"
                ? null
                : { id: sessionCompany, name: "Fixture company" },
          },
        }),
      );
    requests.push({
      method: req.method ?? "",
      path: req.url ?? "",
      body: input ? JSON.parse(input) : null,
    });
    res.writeHead(status);
    res.end(JSON.stringify({ success: true, data: body }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture endpoint unavailable");
  process.env.FLEETORA_API_URL = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (previous === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = previous;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test.beforeEach(() => {
  role = "COMPANY_ADMIN";
  sessionCompany = companyId;
  status = 200;
  requests = [];
  body = { companyId, items: [pickup], hasNext: false };
});
test("reads allowlisted pickup data without credentials or private upstream fields", async () => {
  const result = await pickupsForSession(jar, scope, {
    action: "list",
    page: 1,
  });
  expect(result.status).toBe("ready");
  expect(JSON.stringify(result)).not.toContain("must-not-reach-client");
  expect(requests).toEqual([
    { method: "GET", path: "/pickups?page=1&pageSize=25", body: null },
  ]);
});
for (const denied of ["PLATFORM_ADMIN", "MERCHANT", "ACCOUNTANT"])
  test(`denies ${denied} pickup access before dispatch`, async () => {
    role = denied;
    expect(
      await pickupsForSession(jar, scope, { action: "list", page: 1 }),
    ).toEqual({ status: "forbidden" });
    expect(requests).toEqual([]);
  });
test("blocks changed company dispatch and rejects foreign nested pickup parcels", async () => {
  sessionCompany = "another-company";
  expect(
    await pickupsForSession(jar, scope, { action: "list", page: 1 }),
  ).toEqual({ status: "changed" });
  expect(requests).toEqual([]);
  sessionCompany = companyId;
  body = {
    companyId,
    pickup: {
      ...pickup,
      parcels: [
        {
          id: shipmentId,
          shipmentId,
          companyId: "foreign",
          merchantId,
          receipt: "PENDING",
        },
      ],
    },
  };
  expect(await pickupsForSession(jar, scope, { action: "detail", id })).toEqual(
    { status: "changed" },
  );
});
test("requires matching detail identity and rejects unbounded responses", async () => {
  body = { companyId, pickup: { ...pickup, id: shipmentId } };
  expect(await pickupsForSession(jar, scope, { action: "detail", id })).toEqual(
    { status: "changed" },
  );
  body = {
    companyId,
    items: Array.from({ length: 26 }, () => pickup),
    hasNext: false,
  };
  expect(
    await pickupsForSession(jar, scope, { action: "list", page: 1 }),
  ).toEqual({ status: "unavailable" });
});
test("never retries an uncertain physical receipt mutation", async () => {
  status = 503;
  expect(
    await pickupsForSession(jar, scope, {
      action: "receipts",
      id,
      input: {
        revision: 1,
        parcels: [{ parcelId: shipmentId, receipt: "RECEIVED" }],
      },
    }),
  ).toEqual({ status: "uncertain" });
  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe("POST");
});
test("scopes merchant request queues and denies a foreign merchant request response", async () => {
  body = {
    companyId,
    items: [
      {
        id,
        companyId,
        merchantId,
        shipmentId,
        kind: "AMEND",
        reason: "Fixture address change",
        createdAt: "2026-10-22T08:00:00Z",
        privateSecret: "private",
      },
    ],
  };
  expect(
    (await requestsForSession(jar, scope, { kind: "changes", action: "list" }))
      .status,
  ).toBe("ready");
  body = {
    companyId,
    items: [
      {
        id,
        companyId: "foreign",
        merchantId,
        createdAt: "2026-10-22T08:00:00Z",
      },
    ],
  };
  expect(
    await requestsForSession(jar, scope, {
      kind: "settlements",
      action: "list",
    }),
  ).toEqual({ status: "changed" });
});
test("accountants may review settlement requests but never parcel amendments", async () => {
  role = "ACCOUNTANT";
  body = { companyId, items: [] };
  expect(
    await requestsForSession(jar, scope, { kind: "changes", action: "list" }),
  ).toEqual({ status: "forbidden" });
  expect(
    (
      await requestsForSession(jar, scope, {
        kind: "settlements",
        action: "list",
      })
    ).status,
  ).toBe("ready");
});
test("does not claim merchant request review succeeded on an uncertain response", async () => {
  status = 503;
  expect(
    await requestsForSession(jar, scope, {
      kind: "changes",
      action: "review",
      id,
      input: {
        action: "REJECT",
        parcelRevision: 1,
        reason: "Fixture rejection",
      },
    }),
  ).toEqual({ status: "uncertain" });
  expect(requests).toHaveLength(1);
});

test("paginates request queues without accepting unbounded page input", async () => {
  body = { companyId, items: [], hasNext: true };
  expect(
    await requestsForSession(jar, scope, {
      kind: "changes",
      action: "list",
      page: 2,
    }),
  ).toEqual({ status: "ready", items: [], hasNext: true });
  expect(requests[0].path).toBe("/parcel-requests?page=2&pageSize=25");
  expect(
    await requestsForSession(jar, scope, {
      kind: "settlements",
      action: "list",
      page: 0,
    }),
  ).toEqual({ status: "invalid" });
  expect(requests).toHaveLength(1);
});
