import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import {
  readWarehousesForSession,
  writeWarehouseForSession,
} from "./warehouses.server";
import type { WarehouseQuery, WarehouseWrite } from "./warehouses.types";

type Jar = Parameters<typeof writeWarehouseForSession>[0];
type Reply = { method: string; path: string; status?: number; body?: unknown };
type Seen = {
  method: string;
  path: string;
  search: string;
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
  company: { id: "company-a", name: "Company A" },
};
const warehouse = {
  id,
  name: "Main Hub",
  address: "Fictional industrial zone 4",
  archived: false,
};
const saved = (data: Record<string, unknown> = {}) => ({
  success: true,
  data: { companyId: "company-a", warehouse, ...data },
});
const session: Reply = {
  method: "GET",
  path: "/auth/session",
  body: { success: true, data: user },
};
const query: WarehouseQuery = {
  search: "",
  status: "ACTIVE",
  page: 1,
  pageSize: 20,
};

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture.invalid");
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      seen.push({
        method: request.method ?? "",
        path: url.pathname,
        search: url.search,
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
  replies = [{ ...session }];
});
test.afterAll(async () => {
  if (originalApi === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = originalApi;
  if (server?.listening)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

test("reads the requested status page and strips unknown fields", async () => {
  replies.push({
    method: "GET",
    path: "/warehouses",
    body: {
      success: true,
      data: {
        companyId: "company-a",
        items: [{ ...warehouse, archived: true, companyId: "x", secret: "y" }],
        page: 1,
        pageSize: 20,
        hasNext: false,
      },
    },
  });
  const result = await readWarehousesForSession(jar, scope, {
    ...query,
    status: "ARCHIVED",
    search: " hub ",
  });
  expect(result).toEqual({
    status: "list",
    data: {
      items: [{ ...warehouse, archived: true }],
      page: 1,
      pageSize: 20,
      hasNext: false,
    },
  });
  expect(new URLSearchParams(seen[1].search).toString()).toBe(
    "status=ARCHIVED&page=1&pageSize=20&search=hub",
  );
});

test("treats a list from another company or the wrong status as unusable", async () => {
  for (const [data, status] of [
    [{ companyId: "company-b", items: [], page: 1, pageSize: 20, hasNext: false }, "changed"],
    [{ companyId: "company-a", items: [{ ...warehouse, archived: true }], page: 1, pageSize: 20, hasNext: false }, "unavailable"],
  ] as const) {
    replies = [{ ...session }, { method: "GET", path: "/warehouses", body: { success: true, data } }];
    expect((await readWarehousesForSession(jar, scope, query)).status).toBe(status);
  }
});

test("creates with normalized allowlisted fields and the session company context", async () => {
  replies.push({ method: "POST", path: "/warehouses", status: 201, body: saved() });
  const result = await writeWarehouseForSession(jar, scope, {
    kind: "create",
    input: {
      name: "  Main   Hub ",
      address: " Fictional  industrial zone 4 ",
      companyId: "company-b",
      archived: true,
    },
  } as unknown as WarehouseWrite);
  expect(result).toEqual({ status: "saved", data: warehouse });
  expect(seen[1]).toMatchObject({
    method: "POST",
    path: "/warehouses",
    context: "company-a",
    body: { name: "Main Hub", address: "Fictional industrial zone 4" },
  });
});

test("edits and archives through the matching endpoints", async () => {
  replies.push({ method: "PATCH", path: `/warehouses/${id}`, body: saved() });
  expect(
    (
      await writeWarehouseForSession(jar, scope, {
        kind: "edit",
        id,
        input: { name: "Main Hub", address: "Fictional road 12" },
      })
    ).status,
  ).toBe("saved");
  replies.push(
    { ...session },
    {
      method: "PUT",
      path: `/warehouses/${id}/archive`,
      body: saved({ warehouse: { ...warehouse, archived: true } }),
    },
  );
  const archived = await writeWarehouseForSession(jar, scope, {
    kind: "archive",
    id,
    archived: true,
  });
  expect(archived).toMatchObject({ status: "saved", data: { archived: true } });
  expect(
    seen
      .filter((item) => item.method !== "GET")
      .map(({ method, path, context, body }) => ({ method, path, context, body })),
  ).toEqual([
    {
      method: "PATCH",
      path: `/warehouses/${id}`,
      context: "company-a",
      body: { name: "Main Hub", address: "Fictional road 12" },
    },
    {
      method: "PUT",
      path: `/warehouses/${id}/archive`,
      context: "company-a",
      body: { archived: true },
    },
  ]);
});

for (const operation of [
  { kind: "create", input: { name: "A", address: "Fictional road 1" } },
  { kind: "create", input: { name: "Valid Name", address: "abc" } },
  { kind: "edit", id: "not-a-uuid", input: { name: "Valid", address: "Fictional road 1" } },
  { kind: "archive", id, archived: "yes" },
  { kind: "delete", id },
])
  test(`rejects invalid write before contacting the backend: ${JSON.stringify(operation).slice(0, 50)}`, async () => {
    const result = await writeWarehouseForSession(
      jar,
      scope,
      operation as unknown as WarehouseWrite,
    );
    expect(result).toEqual({ status: "invalid" });
    expect(seen).toEqual([]);
  });

test("refuses a stale scope or non company-admin session without dispatching", async () => {
  expect(
    await writeWarehouseForSession(
      jar,
      { userId: "admin", companyId: "company-b" },
      { kind: "archive", id, archived: true },
    ),
  ).toEqual({ status: "changed" });
  replies = [{ ...session, body: { success: true, data: { ...user, role: "MERCHANT" } } }];
  expect(
    await writeWarehouseForSession(jar, scope, { kind: "archive", id, archived: true }),
  ).toEqual({ status: "forbidden" });
  expect(seen.map((item) => item.path)).toEqual(["/auth/session", "/auth/session"]);
});

test("maps backend failures and mismatched responses", async () => {
  const path = `/warehouses/${id}/archive`;
  const cases: [Reply, string][] = [
    [{ method: "PUT", path, status: 404 }, "not-found"],
    [{ method: "PUT", path, status: 409 }, "conflict"],
    [{ method: "PUT", path, status: 403 }, "forbidden"],
    [{ method: "PUT", path, status: 400 }, "invalid"],
    [{ method: "PUT", path, status: 500 }, "uncertain"],
    [{ method: "PUT", path, body: saved({ companyId: "company-b" }) }, "changed"],
    [
      {
        method: "PUT",
        path,
        body: saved({
          warehouse: { ...warehouse, id: "44444444-4444-4444-8444-444444444444" },
        }),
      },
      "uncertain",
    ],
  ];
  for (const [reply, status] of cases) {
    replies = [{ ...session }, reply];
    const result = await writeWarehouseForSession(jar, scope, {
      kind: "archive",
      id,
      archived: true,
    });
    expect(result.status).toBe(status);
  }
});
