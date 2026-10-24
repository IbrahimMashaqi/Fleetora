import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { operationsForSession } from "./operations.server";
import type { Operation } from "./operations-contract";
const company = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const parcelId = "10000000-0000-4000-8000-000000000003";
const scope = { userId, companyId: company };
let backend: Server;
let oldApi: string | undefined;
let role: string;
let sessionCompany: string;
let responseCompany: string;
let status: number;
let disconnect: boolean;
let sessionStatus: number;
let requests: {
  path: string;
  method: string;
  context: string | undefined;
  body: unknown;
}[];
const jar = {
  get: (key: string) =>
    key.includes("access") ? { value: "fixture-access" } : undefined,
  set() {},
  delete() {},
};
test.beforeAll(async () => {
  oldApi = process.env.FLEETORA_API_URL;
  backend = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const path = new URL(req.url ?? "/", "http://fixture.invalid").pathname;
    requests.push({
      path,
      method: req.method ?? "",
      context:
        typeof req.headers["x-fleetora-company-context"] === "string"
          ? req.headers["x-fleetora-company-context"]
          : undefined,
      body: body ? JSON.parse(body) : null,
    });
    if (path === "/auth/session")
      return res
        .writeHead(sessionStatus, { "Content-Type": "application/json" })
        .end(
          JSON.stringify({
            success: true,
            data: {
              id: userId,
              name: "Fixture",
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
    if (disconnect) {
      req.socket.destroy();
      return;
    }
    return res.writeHead(status, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        success: true,
        data: {
          companyId: responseCompany,
          items: [],
          page: 1,
          pageSize: 25,
          hasNext: false,
          parcel: { id: parcelId },
          password: "private",
        },
      }),
    );
  });
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const address = backend.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture address unavailable");
  process.env.FLEETORA_API_URL = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (oldApi === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = oldApi;
  backend.closeAllConnections();
  await new Promise<void>((resolve) => backend.close(() => resolve()));
});
test.beforeEach(() => {
  role = "COMPANY_ADMIN";
  sessionCompany = company;
  responseCompany = company;
  status = 200;
  sessionStatus = 200;
  disconnect = false;
  requests = [];
});
test("reads scoped allowlisted pages with trusted company context", async () => {
  const result = await operationsForSession(jar, scope, {
    resource: "parcels",
    query: { page: "1", pageSize: "25" },
  });
  expect(result).toEqual({
    status: "ready",
    data: {
      kind: "page",
      data: { items: [], page: 1, pageSize: 25, hasNext: false },
    },
  });
  expect(requests[1]).toMatchObject({
    path: "/parcels",
    method: "GET",
    context: company,
  });
  expect(JSON.stringify(result)).not.toContain("private");
});
for (const denied of ["PLATFORM_ADMIN", "MERCHANT"])
  test(`rejects ${denied} before a tenant operation`, async () => {
    role = denied;
    expect(
      await operationsForSession(jar, scope, { resource: "parcels" }),
    ).toEqual({ status: "forbidden" });
    expect(requests).toHaveLength(1);
  });
test("accountant can request a financial directory through existing session", async () => {
  role = "ACCOUNTANT";
  expect(
    (await operationsForSession(jar, scope, { resource: "collections" }))
      .status,
  ).toBe("ready");
});
test("changed company prevents dispatch and foreign responses never reach the client", async () => {
  sessionCompany = "20000000-0000-4000-8000-000000000001";
  expect(
    await operationsForSession(jar, scope, { resource: "parcels" }),
  ).toEqual({ status: "changed" });
  expect(requests).toHaveLength(1);
  sessionCompany = company;
  responseCompany = "foreign";
  expect(
    await operationsForSession(jar, scope, { resource: "parcels" }),
  ).toEqual({ status: "changed" });
});
test("request identifiers cannot escape allowlisted endpoint paths", async () => {
  expect(
    await operationsForSession(jar, scope, {
      resource: "parcels",
      id: "../users",
    }),
  ).toEqual({ status: "invalid" });
  expect(requests).toHaveLength(0);
});
test("financial posts strip client tenant ownership and preserve their idempotency key", async () => {
  const operation: Operation = {
    resource: "collections",
    action: "create",
    input: {
      parcelId,
      amount: "10.00",
      method: "CASH",
      idempotencyKey: "fixture-request-key",
      companyId: "foreign",
      confirmedBy: "foreign",
    },
  };
  await operationsForSession(jar, scope, operation);
  expect(requests[1]).toMatchObject({
    path: "/collections",
    method: "POST",
    body: {
      parcelId,
      amount: "10.00",
      method: "CASH",
      idempotencyKey: "fixture-request-key",
    },
    context: company,
  });
  expect(requests[1].body).not.toHaveProperty("companyId");
  expect(requests).toHaveLength(2);
});
test("uncertain writes are dispatched once and never automatically retried", async () => {
  disconnect = true;
  expect(
    await operationsForSession(jar, scope, {
      resource: "parcels",
      id: parcelId,
      action: "transition",
      input: { revision: 1, status: "DELIVERED" },
    }),
  ).toEqual({ status: "uncertain" });
  expect(requests).toHaveLength(2);
});
for (const [code, expected] of [
  [400, "invalid"],
  [403, "forbidden"],
  [404, "not-found"],
  [409, "conflict"],
  [503, "unavailable"],
] as const)
  test(`maps ${code} to a safe localized client result`, async () => {
    status = code;
    expect(
      await operationsForSession(jar, scope, { resource: "parcels" }),
    ).toEqual({ status: expected });
  });
test("session service failure never dispatches an operational request", async () => {
  sessionStatus = 503;
  expect(
    await operationsForSession(jar, scope, { resource: "parcels" }),
  ).toEqual({ status: "unavailable" });
  expect(requests).toHaveLength(1);
});
