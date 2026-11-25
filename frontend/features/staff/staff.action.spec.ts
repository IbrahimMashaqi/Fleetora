import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { readStaffForSession, writeStaffForSession } from "./staff.server";

const companyId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const invitationId = "10000000-0000-4000-8000-000000000004";
const scope = { userId, companyId };
const token = "a".repeat(64);
let backend: Server;
let oldApi: string | undefined;
let role: string;
let sessionCompany: string;
let responseCompany: string;
let status: number;
let disconnected: boolean;
let requests: { path: string; method: string; body: unknown; context?: string | string[] }[];
const jar = {
  get: (name: string) => (name.includes("access") ? { value: "fixture-access" } : undefined),
  set() {},
  delete() {},
};
const invitation = {
  id: invitationId,
  email: "accountant@example.com",
  role: "ACCOUNTANT",
  state: "PENDING",
  expiresAt: "2026-12-01T12:00:00Z",
  createdAt: "2026-11-25T12:00:00Z",
  acceptedAt: null,
  revokedAt: null,
};

test.beforeAll(async () => {
  oldApi = process.env.FLEETORA_API_URL;
  backend = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://fixture.invalid").pathname;
    let raw = "";
    for await (const chunk of req) raw += chunk;
    requests.push({
      path,
      method: req.method ?? "",
      body: raw ? JSON.parse(raw) : null,
      context: req.headers["x-fleetora-company-context"],
    });
    res.setHeader("Content-Type", "application/json");
    if (path === "/auth/session")
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            id: userId,
            name: "Fixture administrator",
            email: null,
            role,
            orgId: role === "PLATFORM_ADMIN" ? null : sessionCompany,
            company: role === "PLATFORM_ADMIN" ? null : { id: sessionCompany, name: "Fixture company" },
          },
        }),
      );
    if (disconnected) {
      req.socket.destroy();
      return;
    }
    res.statusCode = status;
    res.end(
      JSON.stringify({
        success: true,
        data:
          req.method === "POST"
            ? {
                companyId: responseCompany,
                invitation: { ...invitation, tokenHash: "private-hash" },
                token,
                delivery: "MANUAL",
              }
            : req.method === "DELETE"
              ? { companyId: responseCompany, revoked: true }
              : req.method === "PUT"
                ? {
                    companyId: responseCompany,
                    member: { id: invitationId, fullName: "Fixture Accountant", email: "a@example.com", role: "ACCOUNTANT", active: JSON.parse(raw).active, password: "private" },
                  }
              : {
                  companyId: responseCompany,
                  members: [
                    {
                      id: userId,
                      fullName: "Fixture administrator",
                      email: "admin@example.com",
                      role: "COMPANY_ADMIN",
                      active: true,
                      password: "private-password",
                    },
                  ],
                  invitations: [{ ...invitation, tokenHash: "private-hash" }],
                },
      }),
    );
  });
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const address = backend.address();
  if (!address || typeof address === "string") throw new Error("Fixture address unavailable");
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
  sessionCompany = companyId;
  responseCompany = companyId;
  status = 200;
  disconnected = false;
  requests = [];
});

test("reads members and invitations and strips private fields", async () => {
  const result = await readStaffForSession(jar, scope);
  expect(result).toEqual({
    status: "ready",
    members: [
      {
        id: userId,
        fullName: "Fixture administrator",
        email: "admin@example.com",
        role: "COMPANY_ADMIN",
        active: true,
      },
    ],
    invitations: [
      {
        id: invitationId,
        email: "accountant@example.com",
        role: "ACCOUNTANT",
        state: "PENDING",
        expiresAt: "2026-12-01T12:00:00Z",
      },
    ],
  });
  expect(requests[1]).toMatchObject({ path: "/company/staff", method: "GET" });
  expect(JSON.stringify(result)).not.toContain("private");
});

test("issues an invitation with normalized email and the session company context", async () => {
  const result = await writeStaffForSession(jar, scope, {
    action: "issue",
    email: " Accountant@Example.com ",
    role: "ACCOUNTANT",
  });
  expect(result).toEqual({
    status: "issued",
    invitation: {
      id: invitationId,
      email: "accountant@example.com",
      role: "ACCOUNTANT",
      state: "PENDING",
      expiresAt: "2026-12-01T12:00:00Z",
    },
    token,
  });
  expect(requests[1]).toMatchObject({
    path: "/company/staff/invitations",
    method: "POST",
    body: { email: "accountant@example.com", role: "ACCOUNTANT" },
    context: companyId,
  });
});

test("revokes only the selected invitation", async () => {
  expect(await writeStaffForSession(jar, scope, { action: "revoke", id: invitationId })).toEqual({
    status: "revoked",
  });
  expect(requests[1]).toMatchObject({
    path: `/company/staff/invitations/${invitationId}`,
    method: "DELETE",
    context: companyId,
  });
});

for (const denied of ["ACCOUNTANT", "MERCHANT", "PLATFORM_ADMIN"])
  test(`denies ${denied} before any staff request is dispatched`, async () => {
    role = denied;
    expect(await readStaffForSession(jar, scope)).toEqual({ status: "forbidden" });
    expect(
      await writeStaffForSession(jar, scope, { action: "issue", email: "x@example.com", role: "ACCOUNTANT" }),
    ).toEqual({ status: "forbidden" });
    expect(requests.map((request) => request.path)).toEqual(["/auth/session", "/auth/session"]);
  });

test("fences a session company change before dispatch and a foreign company in responses", async () => {
  sessionCompany = "20000000-0000-4000-8000-000000000001";
  expect(
    await writeStaffForSession(jar, scope, { action: "issue", email: "x@example.com", role: "ACCOUNTANT" }),
  ).toEqual({ status: "changed" });
  expect(requests).toHaveLength(1);
  sessionCompany = companyId;
  responseCompany = "20000000-0000-4000-8000-000000000001";
  expect(await readStaffForSession(jar, scope)).toEqual({ status: "changed" });
  expect(
    await writeStaffForSession(jar, scope, { action: "revoke", id: invitationId }),
  ).toEqual({ status: "changed" });
});

test("rejects forged roles, extra authority fields and path injection without dispatch", async () => {
  for (const operation of [
    { action: "issue", email: "x@example.com", role: "PLATFORM_ADMIN" },
    { action: "issue", email: "x@example.com", role: "ACCOUNTANT", companyId: "foreign" },
    { action: "issue", email: "not-an-email", role: "ACCOUNTANT" },
    { action: "revoke", id: "../foreign" },
  ])
    expect(
      await writeStaffForSession(jar, scope, operation as Parameters<typeof writeStaffForSession>[2]),
    ).toEqual({ status: "invalid" });
  expect(requests).toHaveLength(0);
});

test("maps conflicts and dropped connections without claiming success", async () => {
  status = 409;
  expect(
    await writeStaffForSession(jar, scope, { action: "issue", email: "x@example.com", role: "ACCOUNTANT" }),
  ).toEqual({ status: "conflict" });
  status = 404;
  expect(await writeStaffForSession(jar, scope, { action: "revoke", id: invitationId })).toEqual({
    status: "not-found",
  });
  status = 200;
  disconnected = true;
  expect(
    await writeStaffForSession(jar, scope, { action: "issue", email: "x@example.com", role: "ACCOUNTANT" }),
  ).toEqual({ status: "uncertain" });
  expect(await readStaffForSession(jar, scope)).toEqual({ status: "unavailable" });
});

test("deactivates and reactivates a member with the company context", async () => {
  const result = await writeStaffForSession(jar, scope, { action: "setActive", id: invitationId, active: false });
  expect(result).toEqual({
    status: "updated",
    member: { id: invitationId, fullName: "Fixture Accountant", email: "a@example.com", role: "ACCOUNTANT", active: false },
  });
  expect(requests[1]).toMatchObject({
    path: `/company/staff/members/${invitationId}/active`,
    method: "PUT",
    body: { active: false },
    context: companyId,
  });
  expect(JSON.stringify(result)).not.toContain("private");
  status = 409;
  expect(await writeStaffForSession(jar, scope, { action: "setActive", id: invitationId, active: false })).toEqual({
    status: "conflict",
  });
});

test("rejects malformed member status writes without dispatch", async () => {
  for (const operation of [
    { action: "setActive", id: "../x", active: false },
    { action: "setActive", id: invitationId, active: "no" },
    { action: "setActive", id: invitationId, active: false, role: "COMPANY_ADMIN" },
  ])
    expect(
      await writeStaffForSession(jar, scope, operation as Parameters<typeof writeStaffForSession>[2]),
    ).toEqual({ status: "invalid" });
  expect(requests).toHaveLength(0);
});
