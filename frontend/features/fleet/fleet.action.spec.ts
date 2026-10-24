import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { publicRealtimeEndpoint, trackingForSession } from "./fleet.server";
import type { FleetOperation } from "./fleet.types";

let server: Server;
let originalApi: string | undefined;
let originalRealtime: string | undefined;
let company = "company-a";
let role = "COMPANY_ADMIN";
let status = 200;
let disconnected = false;
let responseCompany: string | undefined;
let malformed = false;
let sessionStatus = 200;
let requests: { method: string; path: string; body: unknown; context: string | undefined }[] = [];
const scope = { userId: "admin", companyId: "company-a" };
const headquarters = { latitude: 31, longitude: 35, address: null, revision: 1, updatedAt: "2026-10-17T10:00:00.000Z" };
const input = { latitude: 31, longitude: 35, address: null, expectedRevision: 0 };
const jar = {
  get: (name: string) => name.includes("access") ? { value: "fixture-access" } : undefined,
  set: () => {}, delete: () => {},
};
test.beforeAll(async () => {
  originalApi = process.env.FLEETORA_API_URL;
  originalRealtime = process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL;
  server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const path = new URL(req.url ?? "/", "http://fixture.invalid").pathname;
    requests.push({ method: req.method ?? "", path, body: raw ? JSON.parse(raw) : null,
      context: typeof req.headers["x-fleetora-company-context"] === "string" ? req.headers["x-fleetora-company-context"] : undefined });
    if (path === "/auth/session") {
      res.writeHead(sessionStatus, { "Content-Type": "application/json" }).end(JSON.stringify({ success: true, data: {
        id: "admin", name: "Admin", email: null, role,
        orgId: role === "PLATFORM_ADMIN" ? null : company,
        company: role === "PLATFORM_ADMIN" ? null : { id: company, name: "Company" },
      } }));
      return;
    }
    if (disconnected) { req.socket.destroy(); return; }
    const data = path === "/fleet/locations"
      ? { companyId: responseCompany ?? company, serverTime: "2026-10-17T10:00:00.000Z", freshnessSeconds: 60, headquarters, drivers: malformed ? [{}] : [], passwordHash: "private" }
      : path === "/fleet/socket-ticket"
        ? { companyId: responseCompany ?? company, ticket: "A".repeat(43), expiresAt: "2026-10-17T10:00:30.000Z", accessToken: "private" }
        : { companyId: responseCompany ?? company, headquarters: malformed ? { ...headquarters, latitude: 100 } : headquarters, secret: "private" };
    res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ success: true, data }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture address");
  process.env.FLEETORA_API_URL = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (originalApi === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = originalApi;
  if (originalRealtime === undefined) delete process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL;
  else process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL = originalRealtime;
  await new Promise<void>(resolve => server.close(() => resolve()));
});
test.beforeEach(() => {
  requests = []; company = "company-a"; role = "COMPANY_ADMIN"; status = 200;
  disconnected = false; responseCompany = undefined; malformed = false; sessionStatus = 200;
  delete process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL;
});
test("reads allowlisted snapshots and fences company context", async () => {
  const result = await trackingForSession(jar, scope, { kind: "snapshot" });
  expect(result.status).toBe("snapshot");
  expect(JSON.stringify(result)).not.toContain("private");
  expect(requests[1]).toMatchObject({ method: "GET", path: "/fleet/locations", context: "company-a" });
});
for (const denied of ["PLATFORM_ADMIN", "MERCHANT", "ACCOUNTANT"]) {
  test(`denies ${denied} before operational requests`, async () => {
    role = denied;
    expect(await trackingForSession(jar, scope, { kind: "ticket" })).toEqual({ status: "forbidden" });
    expect(requests).toHaveLength(1);
  });
}
test("revalidates stale user and company scopes before dispatch", async () => {
  company = "company-b";
  expect(await trackingForSession(jar, scope, { kind: "save-headquarters", input })).toEqual({ status: "changed" });
  expect(requests).toHaveLength(1);
  company = "company-a";
  expect(await trackingForSession(jar, { ...scope, userId: "previous-user" }, { kind: "snapshot" })).toEqual({ status: "changed" });
  expect(requests).toHaveLength(2);
});
test("rejects a changed-company response without exposing another tenant", async () => {
  responseCompany = "company-b";
  expect(await trackingForSession(jar, scope, { kind: "snapshot" })).toEqual({ status: "changed" });
});
test("validates coordinates before authentication and allowlists outgoing writes", async () => {
  expect(await trackingForSession(jar, scope, { kind: "save-headquarters", input: { ...input, latitude: Number.NaN } })).toEqual({ status: "invalid" });
  expect(requests).toHaveLength(0);
  const supplied = { ...input, companyId: "company-b", ignored: "private" };
  expect((await trackingForSession(jar, scope, { kind: "save-headquarters", input: supplied })).status).toBe("headquarters");
  expect(requests[1]).toEqual({ method: "PATCH", path: "/companies/me/headquarters", context: "company-a", body: input });
});
test("never replays an uncertain headquarters write", async () => {
  disconnected = true;
  expect(await trackingForSession(jar, scope, { kind: "save-headquarters", input })).toEqual({ status: "uncertain" });
  expect(requests).toHaveLength(2);
});
for (const [code, expected] of [[400, "invalid"], [401, "unauthenticated"], [403, "forbidden"], [409, "conflict"], [503, "uncertain"]] as const) {
  test(`maps headquarters ${code} without replay`, async () => {
    status = code;
    expect(await trackingForSession(jar, scope, { kind: "save-headquarters", input })).toEqual({ status: expected });
    expect(requests).toHaveLength(2);
  });
}
test("unapplied tracking schema is an unavailable read", async () => {
  status = 503;
  expect(await trackingForSession(jar, scope, { kind: "snapshot" })).toEqual({ status: "unavailable" });
  status = 200;
  expect((await trackingForSession(jar, scope, { kind: "snapshot" })).status).toBe("snapshot");
  expect(requests).toHaveLength(4);
});

test("an older backend without fleet routes remains unavailable instead of returning empty data", async () => {
  status = 404;
  expect(await trackingForSession(jar, scope, { kind: "snapshot" })).toEqual({ status: "unavailable" });
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({ method: "GET", path: "/fleet/locations", context: "company-a" });
});
for (const operation of [{ kind: "snapshot" }, { kind: "headquarters" }, { kind: "save-headquarters", input }] satisfies FleetOperation[]) {
  test(`rejects invalid backend projection for ${operation.kind}`, async () => {
    malformed = true;
    expect((await trackingForSession(jar, scope, operation)).status).toBe(operation.kind === "save-headquarters" ? "uncertain" : "unavailable");
  });
}
test("issues a one-use ticket with only public connection configuration", async () => {
  process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL = "https://realtime.example/fleet";
  const result = await trackingForSession(jar, scope, { kind: "ticket" });
  expect(result).toEqual({ status: "ticket", data: { companyId: "company-a", ticket: "A".repeat(43), expiresAt: "2026-10-17T10:00:30.000Z", endpoint: "https://realtime.example" } });
  expect(requests[1]).toMatchObject({ method: "POST", path: "/fleet/socket-ticket", context: "company-a" });
  expect(JSON.stringify(result)).not.toContain("private");
});
test("never exposes URL credentials or server REST paths", () => {
  process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL = "https://user:secret@realtime.example/private";
  expect(publicRealtimeEndpoint()).toBeNull();
  process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL = "https://realtime.example/private?token=secret";
  expect(publicRealtimeEndpoint()).toBeNull();
  delete process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL;
  const previous = process.env.FLEETORA_API_URL;
  process.env.FLEETORA_API_URL = "https://api.example/private/api?token=server-only";
  expect(publicRealtimeEndpoint()).toBe("https://api.example");
  process.env.FLEETORA_API_URL = previous;
});
test("requires HTTPS for production realtime while allowing local HTTP in development", async () => {
  const originalMode = process.env.NODE_ENV;
  try {
    Object.assign(process.env, { NODE_ENV: "production" });
    for (const endpoint of ["http://localhost:3101", "http://127.0.0.1:3101", "http://[::1]:3101", "http://realtime.example"]) {
      process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL = endpoint;
      expect(publicRealtimeEndpoint()).toBeNull();
    }
    process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL = "https://realtime.example/fleet";
    expect(publicRealtimeEndpoint()).toBe("https://realtime.example");
    // The browser origin is HTTPS while the fixture's server-only REST base stays HTTP.
    expect((await trackingForSession(jar, scope, { kind: "ticket" })).status).toBe("ticket");
    process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL = "http://realtime.example";
    expect(await trackingForSession(jar, scope, { kind: "ticket" })).toEqual({ status: "unavailable" });
    expect(requests.filter(request => request.path === "/fleet/socket-ticket")).toHaveLength(1);
    Object.assign(process.env, { NODE_ENV: "development" });
    for (const endpoint of ["http://localhost:3101", "http://127.0.0.1:3101", "http://[::1]:3101"]) {
      process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL = endpoint;
      expect(publicRealtimeEndpoint()).toBe(endpoint);
    }
    process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL = "http://realtime.example";
    expect(publicRealtimeEndpoint()).toBeNull();
  } finally {
    if (originalMode === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: originalMode });
  }
});
test("uses the configured HTTPS public origin instead of exposing internal REST configuration", () => {
  const originalMode = process.env.NODE_ENV;
  const previousApi = process.env.FLEETORA_API_URL;
  try {
    Object.assign(process.env, { NODE_ENV: "production" });
    process.env.FLEETORA_API_URL = "http://internal-api:3001/private/rest";
    delete process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL;
    expect(publicRealtimeEndpoint()).toBeNull();
    process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL = "https://fleet.example/fleet";
    expect(publicRealtimeEndpoint()).toBe("https://fleet.example");
  } finally {
    if (originalMode === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: originalMode });
    if (previousApi === undefined) delete process.env.FLEETORA_API_URL;
    else process.env.FLEETORA_API_URL = previousApi;
  }
});
