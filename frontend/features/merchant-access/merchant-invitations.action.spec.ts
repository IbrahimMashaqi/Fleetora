import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { merchantInvitationsForSession } from "./merchant-invitations.server";

const companyId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const merchantId = "10000000-0000-4000-8000-000000000003";
const invitationId = "10000000-0000-4000-8000-000000000004";
const scope = { userId, companyId };
const token = "a".repeat(64);
let backend: Server;
let oldApi: string | undefined;
let role: string;
let sessionCompany: string;
let responseCompany: string;
let responseMerchant: string;
let status: number;
let disconnected: boolean;
let requests: {
  path: string;
  method: string;
  body: unknown;
  context?: string | string[];
}[];
const jar = {
  get: (name: string) =>
    name.includes("access") ? { value: "fixture-access" } : undefined,
  set() {},
  delete() {},
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
            company:
              role === "PLATFORM_ADMIN"
                ? null
                : { id: sessionCompany, name: "Fixture company" },
          },
        }),
      );
    if (disconnected) {
      req.socket.destroy();
      return;
    }
    const invitation = {
      id: invitationId,
      companyId: responseCompany,
      merchantId: responseMerchant,
      email: "owner@example.com",
      role: "OWNER",
      state: "PENDING",
      expiresAt: "2026-12-01T12:00:00Z",
      tokenHash: "private-hash",
      password: "private-password",
      token,
    };
    res.statusCode = status;
    res.end(
      JSON.stringify({
        success: true,
        data:
          req.method === "POST"
            ? { ...invitation, delivery: "MANUAL" }
            : req.method === "DELETE"
              ? {
                  companyId: responseCompany,
                  merchantId: responseMerchant,
                  revoked: true,
                }
              : {
                  companyId: responseCompany,
                  merchantId: responseMerchant,
                  items: [invitation],
                },
      }),
    );
  });
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const address = backend.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture address unavailable");
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
  responseMerchant = merchantId;
  status = 200;
  disconnected = false;
  requests = [];
});

test("lists invitations with trusted scope and strips tokens and private fields", async () => {
  const result = await merchantInvitationsForSession(jar, scope, merchantId, {
    action: "list",
  });
  expect(result).toEqual({
    status: "ready",
    items: [
      {
        id: invitationId,
        email: "owner@example.com",
        role: "OWNER",
        state: "PENDING",
        expiresAt: "2026-12-01T12:00:00Z",
      },
    ],
  });
  expect(requests[1]).toMatchObject({
    path: `/operations/merchants/${merchantId}/invitations`,
    method: "GET",
    context: companyId,
  });
  expect(JSON.stringify(result)).not.toContain(token);
  expect(JSON.stringify(result)).not.toContain("private");
});
test("issues an OWNER invitation and exposes the manual token only in issuance", async () => {
  const result = await merchantInvitationsForSession(jar, scope, merchantId, {
    action: "issue",
    email: "Owner@Example.com",
  });
  expect(result.status).toBe("issued");
  if (result.status === "issued") expect(result.token).toBe(token);
  expect(requests[1]).toMatchObject({
    method: "POST",
    body: { email: "owner@example.com", role: "OWNER" },
  });
  expect(JSON.stringify(result)).not.toContain("private-hash");
});
test("revokes only the selected invitation in the selected merchant route", async () => {
  expect(
    await merchantInvitationsForSession(jar, scope, merchantId, {
      action: "revoke",
      id: invitationId,
    }),
  ).toEqual({ status: "revoked" });
  expect(requests[1]).toMatchObject({
    path: `/operations/merchants/${merchantId}/invitations/${invitationId}`,
    method: "DELETE",
    body: null,
  });
});
for (const denied of ["ACCOUNTANT", "MERCHANT", "PLATFORM_ADMIN"])
  test(`denies ${denied} before backend invitations dispatch`, async () => {
    role = denied;
    expect(
      await merchantInvitationsForSession(jar, scope, merchantId, {
        action: "list",
      }),
    ).toEqual({ status: "forbidden" });
    expect(requests).toHaveLength(1);
  });
test("fences a company change before dispatch", async () => {
  sessionCompany = "20000000-0000-4000-8000-000000000001";
  expect(
    await merchantInvitationsForSession(jar, scope, merchantId, {
      action: "issue",
      email: "owner@example.com",
    }),
  ).toEqual({ status: "changed" });
  expect(requests).toHaveLength(1);
});
test("fences unexpected company and merchant in backend issuance responses", async () => {
  responseCompany = "20000000-0000-4000-8000-000000000001";
  expect(
    await merchantInvitationsForSession(jar, scope, merchantId, {
      action: "issue",
      email: "owner@example.com",
    }),
  ).toEqual({ status: "changed" });
  responseCompany = companyId;
  responseMerchant = "20000000-0000-4000-8000-000000000002";
  expect(
    await merchantInvitationsForSession(jar, scope, merchantId, {
      action: "list",
    }),
  ).toEqual({ status: "changed" });
});
test("rejects path injection and extra authority fields without dispatch", async () => {
  expect(
    await merchantInvitationsForSession(jar, scope, "../foreign", {
      action: "list",
    }),
  ).toEqual({ status: "invalid" });
  const forged = {
    action: "issue" as const,
    email: "owner@example.com",
    role: "COMPANY_ADMIN",
    companyId: "foreign",
  };
  expect(
    await merchantInvitationsForSession(jar, scope, merchantId, forged),
  ).toEqual({ status: "invalid" });
  expect(requests).toHaveLength(0);
});
test("reports uncertain issuance and exposes no token when the connection drops", async () => {
  disconnected = true;
  expect(
    await merchantInvitationsForSession(jar, scope, merchantId, {
      action: "issue",
      email: "owner@example.com",
    }),
  ).toEqual({ status: "uncertain" });
});
test("preserves backend invitation conflict without claiming issuance success", async () => {
  status = 409;
  expect(
    await merchantInvitationsForSession(jar, scope, merchantId, {
      action: "issue",
      email: "owner@example.com",
    }),
  ).toEqual({ status: "conflict" });
});
