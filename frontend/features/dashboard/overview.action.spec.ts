import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { accessCookie, refreshCookie } from "@/lib/auth/cookies.server";
import { overviewFixture } from "@/tests/fixtures/overview";
import { overviewForSession } from "./overview.server";

let backend: Server;
let originalApi: string | undefined;
let role: string;
let sessionCompany: string;
let sessionUserId: string;
let responseCompany: string;
let responseStatus: number;
let sessionStatus: number;
let refreshStatus: number;
let malformed: boolean;
let disconnected: boolean;
let credentials: Record<string, string>;
let deleted: string[];
let writes: { name: string; value: string }[];
let requests: { path: string; method: string; context: string | undefined; authorization: string | undefined }[];
const scope = { userId: "admin", companyId: "company-a" };
const jar = {
  get: (name: string) => credentials[name] ? { value: credentials[name] } : undefined,
  set: (name: string, value: string) => { writes.push({ name, value }); },
  delete: (name: string) => { deleted.push(name); },
};

test.beforeAll(async () => {
  originalApi = process.env.FLEETORA_API_URL;
  backend = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://fixture.invalid").pathname;
    requests.push({
      path, method: request.method ?? "",
      context: typeof request.headers["x-fleetora-company-context"] === "string" ? request.headers["x-fleetora-company-context"] : undefined,
      authorization: request.headers.authorization,
    });
    if (path === "/auth/refresh") {
      response.writeHead(refreshStatus, { "Content-Type": "application/json" }).end(JSON.stringify({
        success: true, data: { accessToken: "refreshed-access", refreshToken: "refreshed-refresh" },
      }));
      return;
    }
    if (path === "/auth/session") {
      const status = request.headers.authorization === "Bearer refreshed-access" ? 200 : sessionStatus;
      response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ success: true, data: {
        id: sessionUserId, name: "Admin", email: null, role,
        orgId: role === "PLATFORM_ADMIN" ? null : sessionCompany,
        company: role === "PLATFORM_ADMIN" ? null : { id: sessionCompany, name: "Company" },
      } }));
      return;
    }
    if (disconnected) { request.socket.destroy(); return; }
    const fixture = overviewFixture(responseCompany);
    response.writeHead(responseStatus, { "Content-Type": "application/json" }).end(JSON.stringify({
      success: true,
      data: { ...fixture, ...(malformed ? { kpis: {} } : {}), secret: "must-not-leak" },
    }));
  });
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const address = backend.address();
  if (!address || typeof address === "string") throw new Error("Fixture address unavailable");
  process.env.FLEETORA_API_URL = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (originalApi === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = originalApi;
  backend.closeAllConnections();
  await new Promise<void>((resolve) => backend.close(() => resolve()));
});

test.beforeEach(() => {
  role = "COMPANY_ADMIN"; sessionCompany = "company-a"; sessionUserId = "admin";
  responseCompany = "company-a"; responseStatus = 200; sessionStatus = 200; refreshStatus = 200;
  malformed = false; disconnected = false;
  credentials = { [accessCookie]: "fixture-access" }; deleted = []; writes = []; requests = [];
});

for (const allowed of ["COMPANY_ADMIN", "ACCOUNTANT"]) {
  test(`reads ${allowed} aggregates with trusted bearer and company context`, async () => {
    role = allowed;
    expect(await overviewForSession(jar, scope)).toEqual({ status: "ready", data: overviewFixture() });
    expect(requests).toEqual([
      { path: "/auth/session", method: "GET", context: undefined, authorization: "Bearer fixture-access" },
      { path: "/dashboard/overview", method: "GET", context: "company-a", authorization: "Bearer fixture-access" },
    ]);
  });
}

for (const denied of ["PLATFORM_ADMIN", "MERCHANT"]) {
  test(`denies ${denied} before dispatching an overview request`, async () => {
    role = denied;
    expect(await overviewForSession(jar, scope)).toEqual({ status: "forbidden" });
    expect(requests).toHaveLength(1);
  });
}

test("rejects stale user and company scope before requesting private aggregates", async () => {
  sessionCompany = "company-b";
  expect(await overviewForSession(jar, scope)).toEqual({ status: "changed" });
  sessionCompany = "company-a"; sessionUserId = "another-admin";
  expect(await overviewForSession(jar, scope)).toEqual({ status: "changed" });
  expect(requests.every((request) => request.path === "/auth/session")).toBe(true);
});

test("does not expose foreign-company aggregates from a mismatched response", async () => {
  responseCompany = "company-b";
  expect(await overviewForSession(jar, scope)).toEqual({ status: "changed" });
});

test("malformed successful responses do not become zero-value dashboards", async () => {
  malformed = true;
  expect(await overviewForSession(jar, scope)).toEqual({ status: "unavailable" });
});

test("refreshes through the existing session flow and uses only the new trusted bearer", async () => {
  sessionStatus = 401; credentials[refreshCookie] = "fixture-refresh";
  expect((await overviewForSession(jar, scope)).status).toBe("ready");
  expect(requests.map(({ path }) => path)).toEqual(["/auth/session", "/auth/refresh", "/auth/session", "/dashboard/overview"]);
  expect(requests[3].authorization).toBe("Bearer refreshed-access");
  expect(writes).toEqual([
    { name: accessCookie, value: "refreshed-access" },
    { name: refreshCookie, value: "refreshed-refresh" },
  ]);
});

test("a rejected refresh does not clear another tab's newer cookies or dispatch data requests", async () => {
  sessionStatus = 401; refreshStatus = 403; credentials[refreshCookie] = "fixture-refresh";
  expect(await overviewForSession(jar, scope)).toEqual({ status: "changed" });
  expect(deleted).toEqual([]);
  expect(writes).toEqual([]);
  expect(requests.map(({ path }) => path)).toEqual(["/auth/session", "/auth/refresh"]);
});

test("clears expired credentials and never dispatches a protected data read", async () => {
  sessionStatus = 401;
  expect(await overviewForSession(jar, scope)).toEqual({ status: "unauthenticated" });
  expect(deleted).toEqual([accessCookie, refreshCookie]);
  expect(requests).toHaveLength(1);
});

test("backend session failure preserves cookies and prevents data dispatch", async () => {
  sessionStatus = 503;
  expect(await overviewForSession(jar, scope)).toEqual({ status: "unavailable" });
  expect(deleted).toEqual([]);
  expect(requests).toHaveLength(1);
});

for (const [status, expected] of [[401, "unauthenticated"], [403, "forbidden"], [503, "unavailable"]] as const) {
  test(`maps backend ${status} to a safe result`, async () => {
    responseStatus = status;
    expect(await overviewForSession(jar, scope)).toEqual({ status: expected });
    expect(deleted).toEqual(status === 401 ? [accessCookie, refreshCookie] : []);
  });
}

test("transport failure reports retryable unavailability without raw errors", async () => {
  disconnected = true;
  expect(await overviewForSession(jar, scope)).toEqual({ status: "unavailable" });
  expect(requests).toHaveLength(2);
});
