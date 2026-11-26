import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { driverAccessForSession } from "./driver-access.server";
const companyId = "10000000-0000-4000-8000-000000000001";
const workerId = "10000000-0000-4000-8000-000000000003";
const scope = { userId: "staff", companyId };
const token = "d".repeat(64);
let server: Server,
  role: string,
  responseCompany: string,
  url: string,
  status: number;
let calls: { path: string; method: string; body: unknown; company: unknown }[];
let invitationBlockedReason: string | null | undefined;
const jar = { get: () => ({ value: "fixture-access" }), set() {}, delete() {} };
const previous = process.env.FLEETORA_API_URL;
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://fixture.invalid").pathname;
    let text = "";
    for await (const chunk of req) text += chunk;
    if (path === "/auth/session")
      return res
        .setHeader("Content-Type", "application/json")
        .end(
          JSON.stringify({
            success: true,
            data: {
              id: "staff",
              name: "Staff",
              email: null,
              role,
              orgId: companyId,
              company: { id: companyId, name: "Fixture", currency: "ILS" },
            },
          }),
        );
    const body = text ? JSON.parse(text) : null;
    calls.push({
      path,
      method: req.method ?? "",
      body,
      company: req.headers["x-fleetora-company-context"],
    });
    const data = {
      companyId: responseCompany,
      workerId,
      phone: "+970591234567",
      linked: true,
      accessActive: true,
      offboarded: false,
      pendingInvitation: null,
      invitationBlockedReason,
      url,
      expiresAt: "2026-12-01T12:00:00Z",
      revoked: true,
      ...(path.endsWith("/offboarding")
        ? { offboarded: true, accessRevoked: body.revokeAccess }
        : {}),
      tokenHash: "must-not-escape",
    };
    res.statusCode = status;
    res
      .setHeader("Content-Type", "application/json")
      .end(JSON.stringify({ success: status < 400, data }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture address");
  process.env.FLEETORA_API_URL = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (previous === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = previous;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test.beforeEach(() => {
  calls = [];
  role = "COMPANY_ADMIN";
  responseCompany = companyId;
  status = 200;
  invitationBlockedReason = null;
  url = `https://fleetora.example.invalid/driver/activate#token=${token}`;
});
for (const actor of ["COMPANY_ADMIN", "OPERATIONS"])
  test(`${actor} reads only the public access contract and issues the HTTPS link`, async () => {
    role = actor;
    expect(
      await driverAccessForSession(jar, scope, { id: workerId, kind: "read" }),
    ).toEqual({
      status: "ready",
      data: {
        workerId,
        phone: "+970591234567",
        linked: true,
        accessActive: true,
        offboarded: false,
        pendingInvitation: null,
        invitationBlockedReason: null,
      },
    });
    expect(
      await driverAccessForSession(jar, scope, {
        id: workerId,
        kind: "invite",
      }),
    ).toEqual({
      status: "issued",
      phone: "+970591234567",
      url,
      expiresAt: "2026-12-01T12:00:00Z",
    });
    expect(calls.at(-1)).toMatchObject({
      method: "POST",
      path: `/drivers/${workerId}/invitations`,
      company: companyId,
    });
  });
test("keeps duplicate-phone access readable and carries only the generic invitation block reason", async () => {
  invitationBlockedReason = "PHONE_IN_USE";
  expect(
    await driverAccessForSession(jar, scope, { id: workerId, kind: "read" }),
  ).toMatchObject({
    status: "ready",
    data: { invitationBlockedReason: "PHONE_IN_USE" },
  });
});
test("supports older access responses during rollout without inventing a phone conflict", async () => {
  invitationBlockedReason = undefined;
  expect(
    await driverAccessForSession(jar, scope, { id: workerId, kind: "read" }),
  ).toMatchObject({
    status: "ready",
    data: { invitationBlockedReason: null },
  });
});
test("retains an invalid-phone reason but rejects an unknown invitation decision", async () => {
  invitationBlockedReason = "INVALID_PHONE";
  expect(
    await driverAccessForSession(jar, scope, { id: workerId, kind: "read" }),
  ).toMatchObject({
    status: "ready",
    data: { invitationBlockedReason: "INVALID_PHONE" },
  });
  invitationBlockedReason = "UNKNOWN";
  expect(
    await driverAccessForSession(jar, scope, { id: workerId, kind: "read" }),
  ).toEqual({ status: "unavailable" });
});
for (const actor of ["ACCOUNTANT", "WAREHOUSE", "MERCHANT"])
  test(`denies ${actor} before access dispatch`, async () => {
    role = actor;
    expect(
      await driverAccessForSession(jar, scope, {
        id: workerId,
        kind: "invite",
      }),
    ).toEqual({ status: "forbidden" });
    expect(calls).toEqual([]);
  });
for (const [index, invalid] of [
  `http://fleetora.example.invalid/driver/activate#token=${token}`,
  `https://fleetora.example.invalid/driver/activate?token=${token}`,
  `https://fleetora.example.invalid/other#token=${token}`,
  "javascript:alert(1)",
].entries())
  test(`refuses unsafe invitation URL ${index}`, async () => {
    url = invalid;
    expect(
      await driverAccessForSession(jar, scope, {
        id: workerId,
        kind: "invite",
      }),
    ).toEqual({ status: "uncertain" });
  });
test("blocks stale scopes, path injection, extra authority and foreign company results", async () => {
  expect(
    await driverAccessForSession(
      jar,
      { ...scope, companyId: "foreign" },
      { id: workerId, kind: "invite" },
    ),
  ).toEqual({ status: "changed" });
  expect(
    await driverAccessForSession(jar, scope, {
      id: "../foreign",
      kind: "invite",
    }),
  ).toEqual({ status: "invalid" });
  const forged = {
    id: workerId,
    kind: "invite" as const,
    companyId: "foreign",
  };
  expect(await driverAccessForSession(jar, scope, forged)).toEqual({
    status: "invalid",
  });
  expect(calls).toEqual([]);
  responseCompany = "foreign";
  expect(
    await driverAccessForSession(jar, scope, { id: workerId, kind: "read" }),
  ).toEqual({ status: "changed" });
});
test("security revocation and offboarding dispatch only the explicit scoped action", async () => {
  expect(
    await driverAccessForSession(jar, scope, {
      id: workerId,
      kind: "revokeAccess",
    }),
  ).toEqual({ status: "updated" });
  expect(
    await driverAccessForSession(jar, scope, {
      id: workerId,
      kind: "offboard",
      revokeAccess: false,
    }),
  ).toEqual({ status: "updated" });
  expect(calls).toEqual([
    {
      path: `/drivers/${workerId}/access`,
      method: "DELETE",
      body: null,
      company: companyId,
    },
    {
      path: `/drivers/${workerId}/offboarding`,
      method: "POST",
      body: { revokeAccess: false },
      company: companyId,
    },
  ]);
  status = 409;
  expect(
    await driverAccessForSession(jar, scope, { id: workerId, kind: "invite" }),
  ).toEqual({ status: "conflict" });
});
