import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { pricingForSession } from "./pricing.server";
import { preparePricingOperation } from "./pricing-contract";
const id = "10000000-0000-4000-8000-000000000001";
const planId = "10000000-0000-4000-8000-000000000002";
const scope = { userId: "admin", companyId: "company-a" };
const zone = {
  id,
  companyId: scope.companyId,
  name: "Fixture locality",
  city: "Fixture city",
  currency: "ILS",
  active: true,
  revision: 1,
  baseFee: "15.00",
  secret: "private upstream detail",
};
const input = {
  name: zone.name,
  city: zone.city,
  currency: "ILS" as const,
  active: true,
  baseFee: "15.00",
};
let server: Server;
let original: string | undefined;
let role: string;
let company: string;
let status: number;
let disconnect: boolean;
let data: unknown;
let requests: {
  path: string;
  method: string;
  body: unknown;
  context: string | undefined;
}[];
const jar = {
  get: (name: string) =>
    name.includes("access") ? { value: "fixture-access" } : undefined,
  set() {},
  delete() {},
};
test.beforeAll(async () => {
  original = process.env.FLEETORA_API_URL;
  server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({
      path: req.url ?? "",
      method: req.method ?? "",
      body: body ? JSON.parse(body) : null,
      context:
        typeof req.headers["x-fleetora-company-context"] === "string"
          ? req.headers["x-fleetora-company-context"]
          : undefined,
    });
    if (req.url === "/auth/session")
      return res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(
          JSON.stringify({
            success: true,
            data: {
              id: scope.userId,
              name: "Fixture admin",
              email: null,
              role,
              orgId: role === "PLATFORM_ADMIN" ? null : company,
              company:
                role === "PLATFORM_ADMIN"
                  ? null
                  : { id: company, name: "Fixture company" },
            },
          }),
        );
    if (disconnect) {
      req.socket.destroy();
      return;
    }
    res
      .writeHead(status, { "Content-Type": "application/json" })
      .end(JSON.stringify({ success: true, data }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture address unavailable");
  process.env.FLEETORA_API_URL = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (original === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = original;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test.beforeEach(() => {
  requests = [];
  role = "COMPANY_ADMIN";
  company = scope.companyId;
  status = 200;
  disconnect = false;
  data = {
    companyId: scope.companyId,
    zone,
    items: [zone],
    page: 1,
    pageSize: 25,
    hasNext: false,
  };
});

test("reads bounded company zones and strips unexpected response fields", async () => {
  const result = await pricingForSession(jar, scope, {
    kind: "zones",
    page: 1,
  });
  expect(result.status).toBe("ready");
  expect(JSON.stringify(result)).not.toContain("private upstream detail");
  expect(requests[1]).toMatchObject({
    path: "/merchant-pricing/zones?page=1&pageSize=25",
    method: "GET",
    context: scope.companyId,
  });
});
for (const denied of ["PLATFORM_ADMIN", "ACCOUNTANT", "MERCHANT"])
  test(`denies ${denied} before pricing dispatch`, async () => {
    role = denied;
    expect(
      (await pricingForSession(jar, scope, { kind: "save-zone", input }))
        .status,
    ).toBe("forbidden");
    expect(requests).toHaveLength(1);
  });
test("fences a changed company before mutation", async () => {
  company = "company-b";
  expect(
    (await pricingForSession(jar, scope, { kind: "save-zone", input })).status,
  ).toBe("changed");
  expect(requests).toHaveLength(1);
});
test("creates and edits zones through exact validated methods and bodies", async () => {
  expect(
    (await pricingForSession(jar, scope, { kind: "save-zone", input })).status,
  ).toBe("saved");
  expect(requests[1]).toMatchObject({
    method: "POST",
    path: "/merchant-pricing/zones",
    body: input,
  });
  expect(
    (
      await pricingForSession(jar, scope, {
        kind: "save-zone",
        id,
        input: { ...input, revision: 1 },
      })
    ).status,
  ).toBe("saved");
  expect(requests[3]).toMatchObject({
    method: "PATCH",
    path: `/merchant-pricing/zones/${id}`,
    body: { ...input, revision: 1 },
  });
});
test("keeps tariff and assignment updates explicit with revision and PUT", async () => {
  data = {
    companyId: scope.companyId,
    planId,
    revision: 2,
    tariff: { companyId: scope.companyId, planId, zoneId: id },
  };
  const tariff = {
    revision: 1,
    fee: "15",
    discount: "1",
    promotionDiscount: "1",
    promotionLabel: "Approved fixture offer",
  };
  expect(
    (
      await pricingForSession(jar, scope, {
        kind: "tariff",
        id: planId,
        zoneId: id,
        input: tariff,
      })
    ).status,
  ).toBe("saved");
  expect(requests[1]).toMatchObject({
    method: "PUT",
    path: `/merchant-pricing/plans/${planId}/tariffs/${id}`,
    body: tariff,
  });
  data = {
    companyId: scope.companyId,
    merchantId: id,
    planId,
    revision: 3,
    discountAmount: "1.00",
  };
  expect(
    (
      await pricingForSession(jar, scope, {
        kind: "assignment",
        id,
        input: { planId, revision: 2, discountAmount: "1" },
      })
    ).status,
  ).toBe("saved");
  expect(requests[3].method).toBe("PUT");
});
test("rejects injected company fields, unbounded pages and arbitrary paths", () => {
  expect(
    preparePricingOperation({
      kind: "save-zone",
      input: { ...input, companyId: "company-b" },
    }),
  ).toBeNull();
  expect(preparePricingOperation({ kind: "zones", page: 100001 })).toBeNull();
  expect(
    preparePricingOperation({ kind: "save-zone", id: "../users", input }),
  ).toBeNull();
  expect(
    preparePricingOperation({
      kind: "assignment",
      id,
      input: { planId, revision: 0, discountAmount: "0" },
    }),
  ).toBeNull();
});
test("vetoes foreign-company responses and malformed money", async () => {
  data = {
    companyId: "company-b",
    items: [],
    page: 1,
    pageSize: 25,
    hasNext: false,
  };
  expect(
    (await pricingForSession(jar, scope, { kind: "zones", page: 1 })).status,
  ).toBe("changed");
  data = {
    companyId: scope.companyId,
    items: [{ ...zone, baseFee: "NaN" }],
    page: 1,
    pageSize: 25,
    hasNext: false,
  };
  expect(
    (await pricingForSession(jar, scope, { kind: "zones", page: 1 })).status,
  ).toBe("unavailable");
});
test("reports revision conflicts and uncertain dispatched writes without retrying", async () => {
  status = 409;
  expect(
    (
      await pricingForSession(jar, scope, {
        kind: "save-zone",
        id,
        input: { ...input, revision: 1 },
      })
    ).status,
  ).toBe("conflict");
  disconnect = true;
  expect(
    (await pricingForSession(jar, scope, { kind: "save-zone", input })).status,
  ).toBe("uncertain");
  expect(
    requests.filter((request) => request.path.startsWith("/merchant-pricing")),
  ).toHaveLength(2);
});
