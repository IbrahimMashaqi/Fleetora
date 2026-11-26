import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { writeDriverForSession } from "./drivers.server";
import type { DriverWrite } from "./drivers.types";

type Jar = Parameters<typeof writeDriverForSession>[0];
type Reply = { method: string; path: string; status?: number; body?: unknown };
type Seen = {
  method: string;
  path: string;
  context: string | undefined;
  body: unknown;
};
let server: Server;
let apiUrl: string;
let replies: Reply[];
let seen: Seen[];
let values: Map<string, string>;
let jar: Jar;
const originalApi = process.env.FLEETORA_API_URL;
const scope = { userId: "admin", companyId: "company-a" };
const id = "33333333-3333-4333-8333-333333333333";
const user = {
  id: "admin",
  name: "Admin",
  email: null,
  role: "COMPANY_ADMIN",
  orgId: "company-a",
  company: { id: "company-a", name: "Company A", currency: "ILS" },
};
const driver = {
  id,
  name: "Amina Driver",
  phone: "+970 599 000001",
  status: "OFFLINE",
  vehicle: null,
};
const saved = (data: Record<string, unknown> = {}) => ({
  success: true,
  data: { companyId: "company-a", driver, ...data },
});

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture.invalid");
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      seen.push({
        method: request.method ?? "",
        path: url.pathname,
        context: request.headers["x-fleetora-company-context"] as
          | string
          | undefined,
        body: raw ? JSON.parse(raw) : undefined,
      });
      const reply = replies.shift();
      if (
        !reply ||
        reply.path !== url.pathname ||
        reply.method !== request.method
      ) {
        response.writeHead(500).end();
        return;
      }
      response
        .writeHead(reply.status ?? 200, { "Content-Type": "application/json" })
        .end(JSON.stringify(reply.body ?? {}));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  apiUrl = `http://127.0.0.1:${address.port}`;
});
test.beforeEach(() => {
  process.env.FLEETORA_API_URL = apiUrl;
  seen = [];
  values = new Map([
    ["fleetora_access", "fixture-access"],
    ["fleetora_refresh", "fixture-refresh"],
  ]);
  jar = {
    get: (name) => {
      const value = values.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name, value) => {
      values.set(name, value);
    },
    delete: (name) => {
      values.delete(name);
    },
  };
  replies = [
    { method: "GET", path: "/auth/session", body: { success: true, data: user } },
  ];
});
test.afterAll(async () => {
  if (originalApi === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = originalApi;
  if (server?.listening)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

test("creates with normalized allowlisted fields and the session company context", async () => {
  replies.push({ method: "POST", path: "/drivers", status: 201, body: saved() });
  const result = await writeDriverForSession(jar, scope, {
    kind: "create",
    input: {
      name: "  Amina   Driver ",
      phone: " +970 599 000001 ",
      companyId: "company-b",
      status: "ACTIVE",
    },
  } as unknown as DriverWrite);
  expect(result).toEqual({ status: "saved", data: driver });
  expect(seen[1]).toEqual({
    method: "POST",
    path: "/drivers",
    context: "company-a",
    body: { name: "Amina Driver", phone: "+970 599 000001" },
  });
});

test("edits and suspends through the matching endpoints", async () => {
  replies.push({ method: "PATCH", path: `/drivers/${id}`, body: saved() });
  expect(
    (
      await writeDriverForSession(jar, scope, {
        kind: "edit",
        id,
        input: { name: "Amina Driver", phone: "0599000001" },
      })
    ).status,
  ).toBe("saved");
  replies.push(
    { method: "GET", path: "/auth/session", body: { success: true, data: user } },
    {
      method: "PUT",
      path: `/drivers/${id}/suspension`,
      body: saved({ driver: { ...driver, status: "SUSPENDED" } }),
    },
  );
  const suspended = await writeDriverForSession(jar, scope, {
    kind: "suspension",
    id,
    suspended: true, reason: 'Documented operational review',
  });
  expect(suspended).toMatchObject({ status: "saved", data: { status: "SUSPENDED" } });
  expect(seen.filter((item) => item.method !== "GET")).toEqual([
    {
      method: "PATCH",
      path: `/drivers/${id}`,
      context: "company-a",
      body: { name: "Amina Driver", phone: "0599000001" },
    },
    {
      method: "PUT",
      path: `/drivers/${id}/suspension`,
      context: "company-a",
      body: { suspended: true, reason: 'Documented operational review' },
    },
  ]);
});

for (const [index, operation] of [
  { kind: "suspension", id, suspended: true },
  { kind: "suspension", id, suspended: true, reason: "  " },
  { kind: "create", input: { name: "A", phone: "0599000001" } },
  { kind: "create", input: { name: "Valid Name", phone: "call me" } },
  { kind: "edit", id: "not-a-uuid", input: { name: "Valid", phone: "0599000001" } },
  { kind: "suspension", id, suspended: "yes" },
  { kind: "delete", id },
].entries())
  test(`rejects invalid write ${index} before contacting the backend: ${JSON.stringify(operation).slice(0, 50)}`, async () => {
    const result = await writeDriverForSession(
      jar,
      scope,
      operation as unknown as DriverWrite,
    );
    expect(result).toEqual({ status: "invalid" });
    expect(seen).toEqual([]);
  });

test("refuses a stale scope without dispatching the write", async () => {
  const result = await writeDriverForSession(
    jar,
    { userId: "admin", companyId: "company-b" },
    { kind: "suspension", id, suspended: true, reason: 'Documented operational review' },
  );
  expect(result).toEqual({ status: "changed" });
  expect(seen.map((item) => item.path)).toEqual(["/auth/session"]);
});

test("refuses non company-admin sessions without dispatching the write", async () => {
  replies[0].body = { success: true, data: { ...user, role: "MERCHANT" } };
  const result = await writeDriverForSession(jar, scope, {
    kind: "suspension",
    id,
    suspended: true, reason: 'Documented operational review',
  });
  expect(result).toEqual({ status: "forbidden" });
  expect(seen).toHaveLength(1);
});

test("maps backend failures and mismatched responses", async () => {
  const cases: [Reply, string][] = [
    [{ method: "PUT", path: `/drivers/${id}/suspension`, status: 404 }, "not-found"],
    [{ method: "PUT", path: `/drivers/${id}/suspension`, status: 403 }, "forbidden"],
    [{ method: "PUT", path: `/drivers/${id}/suspension`, status: 400 }, "invalid"],
    [{ method: "PUT", path: `/drivers/${id}/suspension`, status: 409 }, "conflict"],
    [{ method: "PUT", path: `/drivers/${id}/suspension`, status: 500 }, "uncertain"],
    [
      {
        method: "PUT",
        path: `/drivers/${id}/suspension`,
        body: saved({ companyId: "company-b" }),
      },
      "changed",
    ],
    [
      {
        method: "PUT",
        path: `/drivers/${id}/suspension`,
        body: saved({
          driver: { ...driver, id: "44444444-4444-4444-8444-444444444444" },
        }),
      },
      "uncertain",
    ],
  ];
  for (const [reply, status] of cases) {
    replies = [
      { method: "GET", path: "/auth/session", body: { success: true, data: user } },
      reply,
    ];
    const result = await writeDriverForSession(jar, scope, {
      kind: "suspension",
      id,
      suspended: true, reason: 'Documented operational review',
    });
    expect(result.status).toBe(status);
  }
});
