import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { handleRead } from "@/lib/api/read.route";
const scope = { userId: "read-user", companyId: "read-company" };
let backend: Server, oldApi: string | undefined, requested: string[];
test.beforeAll(async () => {
  oldApi = process.env.FLEETORA_API_URL;
  backend = createServer((req, res) => {
    requested.push(req.url ?? "");
    const data =
      req.url === "/auth/session"
        ? {
            id: scope.userId,
            orgId: scope.companyId,
            name: "Fixture",
            email: null,
            role: "COMPANY_ADMIN",
            company: { id: scope.companyId, name: "Fixture", currency: "ILS" },
          }
        : {
            companyId: scope.companyId,
            items: [{ id: "fixture", label: "محمد", detail: "0590000000" }],
            selected: null,
          };
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: true, data }));
  });
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const address = backend.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture address");
  process.env.FLEETORA_API_URL = `http://127.0.0.1:${address.port}`;
});
test.beforeEach(() => {
  requested = [];
});
test.afterAll(async () => {
  if (oldApi === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = oldApi;
  backend.closeAllConnections();
  await new Promise<void>((resolve) => backend.close(() => resolve()));
});
const read = (
  operation: unknown,
  expected = scope,
  origin = "http://localhost:3100",
) =>
  handleRead(
    new NextRequest("http://localhost:3100/api/read", {
      method: "POST",
      headers: {
        Host: "localhost:3100",
        Origin: origin,
        Cookie: "fleetora_access=fixture",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ area: "operations", scope: expected, operation }),
    }),
  );
test("UX-01 same-origin read returns validated suggestions without an RSC action", async () => {
  const response = await read({
    resource: "lookups",
    query: { kind: "merchants", search: "مح" },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({
    status: "ready",
    data: { kind: "lookups", items: [{ label: "محمد" }] },
  });
});
test("UX-01 read transport rejects cross-origin requests and every write action", async () => {
  expect(
    (await read({ resource: "lookups" }, scope, "https://other.invalid"))
      .status,
  ).toBe(403);
  expect(
    (await read({ resource: "parcels", action: "create", input: {} })).status,
  ).toBe(400);
  expect(
    (await read({ resource: "parcels", input: { status: "DELIVERED" } }))
      .status,
  ).toBe(400);
  expect(requested).toEqual([]);
});
test("UX-01 changed scope cannot dispatch a company lookup", async () => {
  expect(
    await (
      await read(
        { resource: "lookups", query: { kind: "merchants" } },
        { ...scope, companyId: "foreign" },
      )
    ).json(),
  ).toEqual({ status: "changed" });
  expect(requested).toEqual(["/auth/session"]);
});

test("UX-01 read transport cannot dispatch driver-access or fleet mutations", async () => {
  for (const [area, operation] of [
    ["driverAccess", { kind: "invite", id: "fixture" }],
    ["vehicles", { kind: "assign", id: "fixture", vehicleId: "other" }],
    ["pricing", { kind: "save-plan", input: { name: "unauthorized" } }],
    ["pickups", { action: "review", id: "fixture", input: {} }],
  ]) {
    const response = await handleRead(new NextRequest("http://localhost:3100/api/read", { method: "POST", headers: { Host: "localhost:3100", Origin: "http://localhost:3100", "Content-Type": "application/json" }, body: JSON.stringify({ area, scope, operation }) }));
    expect(response.status).toBe(400);
  }
  expect(requested).toEqual([]);
});
