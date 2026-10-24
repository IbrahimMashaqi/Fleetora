import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { fleetForSession } from "./vehicles.server";
let server: Server;
let requests: {
  method: string;
  path: string;
  body: unknown;
  context: string | undefined;
}[] = [];
let role = "COMPANY_ADMIN",
  company = "company-a",
  status = 200,
  disconnect = false,
  responseCompany: string | undefined;
let malformed = false;
let catalogResponse: unknown;
let legacyPlate: string | undefined;
const id = "33333333-3333-4333-8333-333333333333";
const vehicle = {
  id,
  manufacturer: "BMW",
  model: "320i",
  type: "CAR",
  plateNumber: "TEST-42",
  assignedDriver: null,
  password: "private",
};
const scope = { userId: "admin", companyId: "company-a" };
let original: string | undefined;
test.beforeAll(async () => {
  original = process.env.FLEETORA_API_URL;
  server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const path = new URL(req.url ?? "/", "http://fixture.invalid").pathname;
    requests.push({
      method: req.method ?? "",
      path,
      body: raw ? JSON.parse(raw) : null,
      context:
        typeof req.headers["x-fleetora-company-context"] === "string"
          ? req.headers["x-fleetora-company-context"]
          : undefined,
    });
    if (path === "/auth/session") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          success: true,
          data: {
            id: "admin",
            name: "Admin",
            email: null,
            role,
            orgId: role === "PLATFORM_ADMIN" ? null : company,
            company:
              role === "PLATFORM_ADMIN"
                ? null
                : { id: company, name: "Company" },
          },
        }),
      );
      return;
    }
    if (disconnect) {
      req.socket.destroy();
      return;
    }
    if (req.method === "DELETE" && status === 204) {
      res.writeHead(204).end();
      return;
    }
    const data = path.startsWith("/drivers/")
      ? { companyId: responseCompany ?? company, driver: { id } }
      : req.method === "GET"
        ? {
            companyId: responseCompany ?? company,
            items: [
              malformed
                ? { ...vehicle, model: 42 }
                : {
                    ...vehicle,
                    plateNumber: legacyPlate ?? vehicle.plateNumber,
                  },
            ],
            page: 1,
            pageSize: 20,
            hasNext: false,
            catalog: catalogResponse,
          }
        : { companyId: responseCompany ?? company, vehicle };
    res
      .writeHead(status, { "Content-Type": "application/json" })
      .end(JSON.stringify({ success: true, data }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("fixture");
  process.env.FLEETORA_API_URL = `http://127.0.0.1:${addr.port}`;
});
test.afterAll(async () => {
  if (original === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = original;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test.beforeEach(() => {
  requests = [];
  role = "COMPANY_ADMIN";
  company = "company-a";
  status = 200;
  disconnect = false;
  responseCompany = undefined;
  malformed = false;
  catalogResponse = undefined;
  legacyPlate = undefined;
});
const jar = {
  get: (name: string) =>
    name.includes("access") ? { value: "fixture-access" } : undefined,
  set: () => {},
  delete: () => {},
};
const query = { search: "", page: 1, pageSize: 20 };
const input = {
  manufacturer: "BMW",
  model: "320i",
  type: "CAR" as const,
  plateNumber: "TEST-42",
};
test("reads allowlisted company vehicles", async () => {
  const result = await fleetForSession(jar, scope, { kind: "list", query });
  expect(result.status).toBe("list");
  expect(JSON.stringify(result)).not.toContain("private");
});
for (const denied of ["PLATFORM_ADMIN", "MERCHANT", "ACCOUNTANT"])
  test(`denies ${denied}`, async () => {
    role = denied;
    expect(
      (await fleetForSession(jar, scope, { kind: "create", input })).status,
    ).toBe("forbidden");
    expect(requests).toHaveLength(1);
  });
test("vetoes stale company before a write", async () => {
  company = "company-b";
  expect(
    (await fleetForSession(jar, scope, { kind: "create", input })).status,
  ).toBe("changed");
  expect(requests).toHaveLength(1);
});
test("creates once with validated company context header", async () => {
  expect(
    (await fleetForSession(jar, scope, { kind: "create", input })).status,
  ).toBe("saved");
  expect(requests[1]).toMatchObject({
    method: "POST",
    path: "/vehicles",
    context: "company-a",
    body: input,
  });
});
test("edits through PATCH", async () => {
  expect(
    (await fleetForSession(jar, scope, { kind: "edit", id, input })).status,
  ).toBe("saved");
  expect(requests[1].method).toBe("PATCH");
});
test("deletes once through DELETE with no body and accepts an empty 204", async () => {
  status = 204;
  expect(await fleetForSession(jar, scope, { kind: "delete", id })).toEqual({
    status: "saved",
  });
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual({
    method: "DELETE",
    path: `/vehicles/${id}`,
    context: "company-a",
    body: null,
  });
});
test("does not treat a 200 body as confirmation of the DELETE contract", async () => {
  expect(await fleetForSession(jar, scope, { kind: "delete", id })).toEqual({
    status: "uncertain",
  });
  expect(requests).toHaveLength(2);
});
test("validates deletion IDs before resolving a session", async () => {
  expect(
    await fleetForSession(jar, scope, { kind: "delete", id: "not-a-uuid" }),
  ).toEqual({ status: "invalid" });
  expect(requests).toHaveLength(0);
});
for (const denied of ["PLATFORM_ADMIN", "MERCHANT", "ACCOUNTANT"])
  test(`does not dispatch deletion for ${denied}`, async () => {
    role = denied;
    expect(await fleetForSession(jar, scope, { kind: "delete", id })).toEqual({
      status: "forbidden",
    });
    expect(requests).toHaveLength(1);
  });
test("vetoes deletion after a company change", async () => {
  company = "company-b";
  expect(await fleetForSession(jar, scope, { kind: "delete", id })).toEqual({
    status: "changed",
  });
  expect(requests).toHaveLength(1);
});
test("never replays a deletion after a lost connection", async () => {
  disconnect = true;
  expect(await fleetForSession(jar, scope, { kind: "delete", id })).toEqual({
    status: "uncertain",
  });
  expect(requests).toHaveLength(2);
});
for (const [response, expected] of [
  [400, "invalid"],
  [401, "unauthenticated"],
  [403, "forbidden"],
  [404, "not-found"],
  [409, "conflict"],
  [500, "uncertain"],
] as const)
  test(`maps DELETE ${response} without retrying`, async () => {
    status = response;
    expect(await fleetForSession(jar, scope, { kind: "delete", id })).toEqual({
      status: expected,
    });
    expect(requests).toHaveLength(2);
  });
for (const response of [400, 401, 403, 404, 409])
  test(`handles ${response} without replay`, async () => {
    status = response;
    await fleetForSession(jar, scope, { kind: "create", input });
    expect(requests).toHaveLength(2);
  });
test("does not retry an uncertain committed write", async () => {
  disconnect = true;
  expect(
    (await fleetForSession(jar, scope, { kind: "create", input })).status,
  ).toBe("uncertain");
  expect(requests).toHaveLength(2);
});
test("validates before contacting the backend", async () => {
  expect(
    (
      await fleetForSession(jar, scope, {
        kind: "create",
        input: { ...input, plateNumber: "" },
      })
    ).status,
  ).toBe("invalid");
  expect(requests).toHaveLength(0);
});

test("assignment sends required expected state once through PUT", async () => {
  expect(
    (
      await fleetForSession(jar, scope, {
        kind: "assign",
        id,
        vehicleId: null,
        expectedVehicleId: id,
      })
    ).status,
  ).toBe("saved");
  expect(requests[1]).toMatchObject({
    method: "PUT",
    path: `/drivers/${id}/vehicle`,
    body: { vehicleId: null, expectedVehicleId: id },
  });
});
test("discards a response from a changed backend company", async () => {
  responseCompany = "company-b";
  expect(
    (await fleetForSession(jar, scope, { kind: "list", query })).status,
  ).toBe("changed");
});
test("rejects malformed projections rather than rendering invented data", async () => {
  malformed = true;
  expect(
    (await fleetForSession(jar, scope, { kind: "list", query })).status,
  ).toBe("unavailable");
});

for (const plate of ["", "L".repeat(60)])
  test(`reads legacy plate values without weakening write validation: ${plate.length}`, async () => {
    legacyPlate = plate;
    const result = await fleetForSession(jar, scope, { kind: "list", query });
    expect(result.status).toBe("list");
    if (result.status === "list")
      expect(result.data.items[0].plateNumber).toBe(plate);
  });

test("allowlists the catalog returned by the existing directory API", async () => {
  catalogResponse = [
    {
      manufacturer: "Toyota",
      aliases: [],
      models: ["Corolla"],
      secret: "omit",
    },
  ];
  const result = await fleetForSession(jar, scope, { kind: "list", query });
  expect(result.status).toBe("list");
  if (result.status === "list")
    expect(result.data.catalog).toEqual([
      { manufacturer: "Toyota", aliases: [], models: ["Corolla"] },
    ]);
});
test("rejects malformed catalog choices", async () => {
  catalogResponse = [{ manufacturer: "Toyota", aliases: [], models: [42] }];
  expect(await fleetForSession(jar, scope, { kind: "list", query })).toEqual({
    status: "unavailable",
  });
});
test("older API deployments still support explicit custom choices", async () => {
  const result = await fleetForSession(jar, scope, { kind: "list", query });
  expect(result.status).toBe("list");
  if (result.status === "list") expect(result.data.catalog).toEqual([]);
});
