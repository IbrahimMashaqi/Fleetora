import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { handleSession } from "./session.route";
import { revokeSession } from "@/lib/auth/session.server";

type Reply = { path: string; status?: number; body?: unknown; disconnect?: boolean; raw?: string };
let server: Server;
let replies: Reply[];
let requests: { path: string | undefined; method: string | undefined }[];
const originalApi = process.env.FLEETORA_API_URL;
const user = { id: "fixture-user", name: "Fixture User", email: null, role: "COMPANY_ADMIN", orgId: "fixture-company", company: { id: "fixture-company", name: "Fixture Company" } };
const rotated = { success: true, data: { accessToken: "fixture-rotated-access", refreshToken: "fixture-rotated-refresh" } };

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    requests.push({ path: request.url, method: request.method });
    const reply = replies.shift();
    if (!reply || reply.path !== request.url) { response.writeHead(500).end(); return; }
    if (reply.disconnect) { request.socket.destroy(); return; }
    response.writeHead(reply.status ?? 200, { "Content-Type": "application/json" });
    response.end(reply.raw ?? JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing isolated test address");
  process.env.FLEETORA_API_URL = `http://127.0.0.1:${address.port}/`;
});
test.beforeEach(() => { replies = []; requests = []; });
test.afterAll(async () => {
  if (originalApi === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = originalApi;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

function request(cookie = "fleetora_access=fixture-access; fleetora_refresh=fixture-refresh", origin = "http://localhost:3100") {
  return new NextRequest("http://localhost:3100/api/auth/session", { method: "POST", headers: { origin, cookie } });
}
function expectUnchangedCookies(response: Response) { expect(response.headers.get("set-cookie")).toBeNull(); }
function expectClearedCookies(response: Response) {
  const cookies = response.headers.get("set-cookie");
  expect(cookies).toContain("fleetora_access=;");
  expect(cookies).toContain("fleetora_refresh=;");
}

test("returns only validated public session fields without resetting cookies", async () => {
  replies = [{ path: "/auth/session", body: { success: true, data: { ...user, password: "fixture-private", refreshToken: "fixture-private" } } }];
  const response = await handleSession(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ user });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expectUnchangedCookies(response);
});
test("preserves cookies on a network failure", async () => {
  replies = [{ path: "/auth/session", disconnect: true }];
  const response = await handleSession(request());
  expect(response.status).toBe(503);
  expectUnchangedCookies(response);
});
test("preserves cookies on a temporary session outage", async () => {
  replies = [{ path: "/auth/session", status: 503, raw: "Unavailable" }];
  const response = await handleSession(request());
  expect(response.status).toBe(503);
  expectUnchangedCookies(response);
  expect(requests).toEqual([{ path: "/auth/session", method: "GET" }]);
});
test("rejects malformed session identity without treating it as credential expiration", async () => {
  replies = [{ path: "/auth/session", body: { success: true, data: { ...user, orgId: "another-company" } } }];
  const response = await handleSession(request());
  expect(response.status).toBe(503);
  expectUnchangedCookies(response);
  expect(await response.json()).not.toHaveProperty("user");
});
test("clears credentials only after confirmed refresh authentication rejection", async () => {
  replies = [{ path: "/auth/session", status: 401 }, { path: "/auth/refresh", status: 401, body: { success: false } }];
  const response = await handleSession(request());
  expect(response.status).toBe(401);
  expectClearedCookies(response);
  expect(requests.map(r => r.path)).toEqual(["/auth/session", "/auth/refresh"]);
});
for (const message of ["Access Denied: Session expired", "Access Denied: Token mismatch"]) {
  test(`keeps ambiguous refresh rejection recoverable: ${message}`, async () => {
    replies = [{ path: "/auth/session", status: 401 }, { path: "/auth/refresh", status: 403, body: { success: false, message } }];
    const response = await handleSession(request());
    expect(response.status).toBe(409);
    expectUnchangedCookies(response);
    expect(requests.map(r => r.path)).toEqual(["/auth/session", "/auth/refresh"]);
  });
}
test("preserves cookies on a refresh service outage without retrying", async () => {
  replies = [{ path: "/auth/session", status: 401 }, { path: "/auth/refresh", status: 503, body: { success: false } }];
  const response = await handleSession(request());
  expect(response.status).toBe(503);
  expectUnchangedCookies(response);
  expect(requests).toHaveLength(2);
});
test("retains a validated rotated pair after a post-refresh outage for the next retry", async () => {
  replies = [{ path: "/auth/session", status: 401 }, { path: "/auth/refresh", body: rotated }, { path: "/auth/session", status: 503 }];
  const response = await handleSession(request());
  expect(response.status).toBe(503);
  const cookies = response.headers.get("set-cookie") ?? "";
  expect(cookies).toContain("fleetora_access=fixture-rotated-access");
  expect(cookies).toContain("fleetora_refresh=fixture-rotated-refresh");
  expect(cookies).toContain("Max-Age=600");
  expect(cookies).toContain("Max-Age=604800");
  expect(cookies).toContain("HttpOnly");
  expect(cookies).toContain("SameSite=lax");
  expect(await response.json()).not.toHaveProperty("user");
  replies = [{ path: "/auth/session", body: { success: true, data: user } }];
  const retry = await handleSession(request("fleetora_access=fixture-rotated-access; fleetora_refresh=fixture-rotated-refresh"));
  expect(retry.status).toBe(200);
  expectUnchangedCookies(retry);
});
test("clears the rotated pair when the post-refresh identity is explicitly unauthorized", async () => {
  replies = [{ path: "/auth/session", status: 401 }, { path: "/auth/refresh", body: rotated }, { path: "/auth/session", status: 401 }];
  const response = await handleSession(request());
  expect(response.status).toBe(401);
  expectClearedCookies(response);
  expect(requests).toHaveLength(3);
});
test("rejects malformed refresh success without deleting existing credentials", async () => {
  replies = [{ path: "/auth/session", status: 401 }, { path: "/auth/refresh", body: { success: true, data: { accessToken: "" } } }];
  const response = await handleSession(request());
  expect(response.status).toBe(503);
  expectUnchangedCookies(response);
  expect(requests).toHaveLength(2);
});
test("does not treat an unexpected session rejection as proven expiration", async () => {
  replies = [{ path: "/auth/session", status: 403, body: { success: false } }];
  const response = await handleSession(request());
  expect(response.status).toBe(503);
  expectUnchangedCookies(response);
});
test("rejects cross-origin requests before calling the backend", async () => {
  const response = await handleSession(request(undefined, "https://other.example"));
  expect(response.status).toBe(403);
  expectUnchangedCookies(response);
  expect(requests).toEqual([]);
});
test("clears an absent session without attempting refresh", async () => {
  const response = await handleSession(request(""));
  expect(response.status).toBe(401);
  expectClearedCookies(response);
  expect(requests).toEqual([]);
});

test("strips unrecognized fields from nested public company identity", async () => {
  replies = [{ path: "/auth/session", body: { data: { ...user, company: { ...user.company, accessToken: "fixture-private" } } } }];
  const response = await handleSession(request());
  expect(await response.json()).toEqual({ user });
});
test("rejects empty token pairs without installing credentials or fetching identity", async () => {
  replies = [{ path: "/auth/session", status: 401 }, { path: "/auth/refresh", body: { success: true, data: { accessToken: "", refreshToken: "" } } }];
  const response = await handleSession(request());
  expect(response.status).toBe(503);
  expectUnchangedCookies(response);
  expect(requests).toHaveLength(2);
});
for (const failure of ["malformed", "network"] as const) {
  test(`retains the rotated pair after a post-refresh ${failure} failure without exposing identity`, async () => {
    replies = [{ path: "/auth/session", status: 401 }, { path: "/auth/refresh", body: rotated }, {
      path: "/auth/session", ...(failure === "network" ? { disconnect: true } : { body: { data: { ...user, orgId: "other-company" } } }),
    }];
    const response = await handleSession(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toContain("fleetora_refresh=fixture-rotated-refresh");
    expect(await response.json()).not.toHaveProperty("user");
  });
}
test("retains production cookie flags and lifetimes when rotating credentials", async () => {
  const environment: Record<string, string | undefined> = process.env;
  const originalNodeEnv = environment.NODE_ENV;
  try {
    environment.NODE_ENV = "production";
    replies = [{ path: "/auth/session", status: 401 }, { path: "/auth/refresh", body: rotated }, { path: "/auth/session", body: { data: user } }];
    const response = await handleSession(request());
    expect(response.status).toBe(200);
    const cookies = response.headers.get("set-cookie") ?? "";
    for (const attribute of ["Secure", "HttpOnly", "SameSite=lax", "Path=/", "Max-Age=600", "Max-Age=604800"]) expect(cookies).toContain(attribute);
  } finally {
    if (originalNodeEnv === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = originalNodeEnv;
  }
});
test("refreshes only after a confirmed 401 when revoking an expired access token", async () => {
  replies = [{ path: "/auth/logout", status: 401 }, { path: "/auth/refresh", body: rotated }, { path: "/auth/logout", body: { success: true } }];
  expect(await revokeSession({ access: "fixture-access", refresh: "fixture-refresh" })).toBe(true);
  expect(requests.map(r => r.path)).toEqual(["/auth/logout", "/auth/refresh", "/auth/logout"]);
});
test("does not refresh or report revocation success during a logout outage", async () => {
  replies = [{ path: "/auth/logout", status: 503 }];
  expect(await revokeSession({ access: "fixture-access", refresh: "fixture-refresh" })).toBe(false);
  expect(requests.map(r => r.path)).toEqual(["/auth/logout"]);
});
test("does not retry an ambiguous refresh rejection during logout", async () => {
  replies = [{ path: "/auth/refresh", status: 403, body: { message: "Access Denied: Token mismatch" } }];
  expect(await revokeSession({ refresh: "fixture-refresh" })).toBe(false);
  expect(requests.map(r => r.path)).toEqual(["/auth/refresh"]);
});

test("confirms an already absent local session even when backend configuration is malformed", async () => {
  const apiUrl = process.env.FLEETORA_API_URL;
  try {
    process.env.FLEETORA_API_URL = "invalid-backend-url";
    expect(await revokeSession({})).toBe(true);
    expect(requests).toEqual([]);
  } finally {
    if (apiUrl === undefined) delete process.env.FLEETORA_API_URL;
    else process.env.FLEETORA_API_URL = apiUrl;
  }
});
