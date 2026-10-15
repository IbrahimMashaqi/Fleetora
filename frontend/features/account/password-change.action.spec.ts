import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { changePasswordForSession } from "./password-change.server";

type Reply = { path: string; status?: number; body?: unknown; raw?: string; disconnect?: boolean };
type CookieJar = Parameters<typeof changePasswordForSession>[0];
let server: Server;
let apiUrl: string;
let replies: Reply[];
let requests: { path: string | undefined; method: string | undefined; authorization: string | undefined; body: unknown }[];
let values: Map<string, string>;
let writes: { name: string; value: string; options: Parameters<CookieJar["set"]>[2] }[];
let jar: CookieJar;
const originalApi = process.env.FLEETORA_API_URL;
const user = { id: "account-reader", name: "Account Reader", email: null, role: "COMPANY_ADMIN", orgId: "company-a", company: { id: "company-a", name: "Company A" } };
const identity = { success: true, data: user };
const success = { success: true, data: { success: true, message: "Password updated successfully" } };

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [name, value] of Object.entries({ oldPassword: "CurrentPassword9", newPassword: "NewPassword9", confirmPassword: "NewPassword9", ...overrides })) data.set(name, value);
  return data;
}
function change(data = form(), expectedUserId = user.id) {
  return changePasswordForSession(jar, expectedUserId, data);
}
function expectNoSecrets(result: unknown) {
  expect(JSON.stringify(result)).not.toMatch(/CurrentPassword9|NewPassword9|fixture-access|fixture-refresh|rotated-access|rotated-refresh|private-detail/);
}

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    requests.push({ path: request.url, method: request.method, authorization: request.headers.authorization, body: raw ? JSON.parse(raw) : null });
    const reply = replies.shift();
    if (!reply || reply.path !== request.url) { response.writeHead(500).end(); return; }
    if (reply.disconnect) { request.socket.destroy(); return; }
    response.writeHead(reply.status ?? 200, { "Content-Type": "application/json" });
    response.end(reply.raw ?? JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing isolated fixture address");
  apiUrl = `http://127.0.0.1:${address.port}`;
});

test.beforeEach(() => {
  process.env.FLEETORA_API_URL = apiUrl;
  replies = [{ path: "/auth/session", body: identity }, { path: "/auth/update-password", body: success }];
  requests = [];
  values = new Map([["fleetora_access", "fixture-access"], ["fleetora_refresh", "fixture-refresh"]]);
  writes = [];
  jar = {
    get: name => { const value = values.get(name); return value === undefined ? undefined : { value }; },
    set: (name, value, options) => { values.set(name, value); writes.push({ name, value, options }); },
    delete: name => { values.delete(name); },
  };
});

test.afterAll(async () => {
  if (originalApi === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = originalApi;
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test("requires an authenticated session before any password update", async () => {
  values.clear();
  const result = await change();
  expect(result.status).toBe("unauthenticated");
  expect(requests).toHaveLength(0);
  expectNoSecrets(result);
});

for (const [overrides, field] of [
  [{ oldPassword: "" }, "oldPassword"],
  [{ newPassword: "lowercase", confirmPassword: "lowercase" }, "newPassword"],
  [{ newPassword: "Ab1", confirmPassword: "Ab1" }, "newPassword"],
  [{ newPassword: "A" + "a".repeat(72), confirmPassword: "A" + "a".repeat(72) }, "newPassword"],
  [{ newPassword: "A" + "\u00e9".repeat(36), confirmPassword: "A" + "\u00e9".repeat(36) }, "newPassword"],
  [{ confirmPassword: "DifferentPassword9" }, "confirmPassword"],
] as const) {
  test(`rejects invalid ${field} (${Object.values(overrides)[0].length} characters) before transport`, async () => {
    const result = await change(form(overrides));
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.fieldErrors?.[field]).toBeTruthy();
    expect(requests).toHaveLength(0);
    expectNoSecrets(result);
  });
}

test("posts only passwords with cookie-derived authority and returns a minimal acknowledgement", async () => {
  const result = await change(form({ userId: "someone-else", companyId: "company-b", role: "PLATFORM_ADMIN", accessToken: "untrusted-token" }));
  expect(result).toEqual({ status: "success", message: "Your password has been changed." });
  expect(requests).toEqual([
    { path: "/auth/session", method: "GET", authorization: "Bearer fixture-access", body: null },
    { path: "/auth/update-password", method: "POST", authorization: "Bearer fixture-access", body: { oldPassword: "CurrentPassword9", newPassword: "NewPassword9" } },
  ]);
  expect(writes).toHaveLength(0);
  expectNoSecrets(result);
});

test("blocks stale or forged form identity without selecting a target from it", async () => {
  const result = await change(form(), "different-subject");
  expect(result.status).toBe("session-changed");
  expect(requests.map(request => request.path)).toEqual(["/auth/session"]);
  expectNoSecrets(result);
});

test("uses the established refresh flow and persists rotated cookies before mutation", async () => {
  replies = [
    { path: "/auth/session", status: 401 },
    { path: "/auth/refresh", body: { success: true, data: { accessToken: "rotated-access", refreshToken: "rotated-refresh" } } },
    { path: "/auth/session", body: identity },
    { path: "/auth/update-password", body: success },
  ];
  const result = await change();
  expect(result.status).toBe("success");
  expect(requests.map(request => request.path)).toEqual(["/auth/session", "/auth/refresh", "/auth/session", "/auth/update-password"]);
  expect(requests[3].authorization).toBe("Bearer rotated-access");
  expect(values.get("fleetora_access")).toBe("rotated-access");
  expect(values.get("fleetora_refresh")).toBe("rotated-refresh");
  expect(writes.map(write => write.options)).toEqual([
    { httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 600 },
    { httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 604800 },
  ]);
  expectNoSecrets(result);
});

test("retains rotated cookies even if post-refresh session validation is unavailable", async () => {
  replies = [
    { path: "/auth/session", status: 401 },
    { path: "/auth/refresh", body: { success: true, data: { accessToken: "rotated-access", refreshToken: "rotated-refresh" } } },
    { path: "/auth/session", status: 503 },
  ];
  const result = await change();
  expect(result.status).toBe("error");
  expect(values.get("fleetora_refresh")).toBe("rotated-refresh");
  expect(requests).toHaveLength(3);
  expectNoSecrets(result);
});

test("clears credentials after confirmed refresh rejection without mutation", async () => {
  replies = [{ path: "/auth/session", status: 401 }, { path: "/auth/refresh", status: 401 }];
  expect((await change()).status).toBe("unauthenticated");
  expect(values.size).toBe(0);
  expect(requests).toHaveLength(2);
});

test("preserves credentials on ambiguous refresh rejection without retrying", async () => {
  replies = [{ path: "/auth/session", status: 401 }, { path: "/auth/refresh", status: 403, body: { message: "private-detail" } }];
  const result = await change();
  expect(result.status).toBe("session-changed");
  expect(values.get("fleetora_refresh")).toBe("fixture-refresh");
  expect(requests).toHaveLength(2);
  expectNoSecrets(result);
});

test("rejects malformed verified identity before mutation", async () => {
  replies = [{ path: "/auth/session", body: { data: { ...user, orgId: "company-b" } } }];
  expect((await change()).status).toBe("error");
  expect(requests).toHaveLength(1);
});

test("maps the known incorrect-current-password error without returning its raw body", async () => {
  replies[1] = { path: "/auth/update-password", status: 400, body: { message: "Last password is incorrect", password: "private-detail" } };
  const result = await change();
  expect(result).toEqual({ status: "error", fieldErrors: { oldPassword: "Your current password is incorrect." } });
  expectNoSecrets(result);
});

for (const status of [400, 403, 429]) {
  test(`handles backend rejection ${status} safely without retrying`, async () => {
    replies[1] = { path: "/auth/update-password", status, body: { message: ["private-detail", "NewPassword9"] } };
    const result = await change();
    expect(result.status).toBe("error");
    expect(requests).toHaveLength(2);
    expect(values.size).toBe(2);
    expectNoSecrets(result);
  });
}

test("clears rejected authentication without refreshing or replaying the mutation", async () => {
  replies[1] = { path: "/auth/update-password", status: 401 };
  const result = await change();
  expect(result.status).toBe("unauthenticated");
  expect(values.size).toBe(0);
  expect(requests).toHaveLength(2);
  expectNoSecrets(result);
});

for (const reply of [
  { status: 200, body: { success: true, data: { success: false, message: "private-detail" } } },
  { status: 200, body: { success: false, data: { success: true, message: "private-detail" } } },
  { status: 200, body: { success: true, data: { message: "private-detail" } } },
  { status: 200, raw: "not json private-detail" },
  { status: 202, body: success },
  { status: 500, body: { message: "private-detail" } },
  { disconnect: true },
]) {
  test(`does not replay or claim success after an uncertain outcome (${JSON.stringify(reply)})`, async () => {
    replies[1] = { path: "/auth/update-password", ...reply };
    const result = await change();
    expect(result.status).toBe("uncertain");
    expect(requests.filter(request => request.path === "/auth/update-password")).toHaveLength(1);
    expectNoSecrets(result);
  });
}

for (const config of [undefined, "invalid-url"]) {
  test(`fails safely when backend configuration is ${config ? "malformed" : "missing"}`, async () => {
    if (config) process.env.FLEETORA_API_URL = config;
    else delete process.env.FLEETORA_API_URL;
    const result = await change();
    expect(result.status).toBe("error");
    expect(requests).toHaveLength(0);
    expectNoSecrets(result);
  });
}
