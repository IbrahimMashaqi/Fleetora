import { createServer, type Server } from "node:http";
import { NextRequest } from "next/server";
import { expect, test } from "@playwright/test";
import { handleCompany } from "./company.route";
import { handlePlatform } from "@/features/platform/platform.route";
import { POST as activate } from "@/app/api/company/activate/route";
const userId = "10000000-0000-4000-8000-000000000001",
  companyId = "10000000-0000-4000-8000-000000000002";
const company = {
  id: companyId,
  name: "Company",
  phone: null,
  address: null,
  approvalStatus: "ACTIVE",
  status: "ACTIVE",
  suspended: false,
  rejectionReason: null,
  currency: "ILS",
  plan: "TRIAL",
  revision: 1,
};
let server: Server,
  oldApi: string | undefined,
  role: string,
  foreignResponse: boolean,
  paths: string[],
  writes: { path: string; body: unknown; context: string | undefined }[];
test.beforeAll(async () => {
  oldApi = process.env.FLEETORA_API_URL;
  server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    paths.push(req.url ?? "");
    let raw = "";
    for await (const chunk of req) raw += chunk;
    if (req.url === "/auth/session")
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            id: userId,
            name: "Admin",
            email: null,
            role,
            orgId: role === "PLATFORM_ADMIN" ? null : companyId,
            company:
              role === "PLATFORM_ADMIN"
                ? null
                : {
                    id: companyId,
                    name: "Company",
                    currency: "ILS",
                    approvalStatus: "ACTIVE",
                  },
          },
        }),
      );
    if (req.method !== "GET")
      writes.push({
        path: req.url ?? "",
        body: raw ? JSON.parse(raw) : null,
        context:
          typeof req.headers["x-fleetora-company-context"] === "string"
            ? req.headers["x-fleetora-company-context"]
            : undefined,
      });
    res.end(
      JSON.stringify({
        success: true,
        data:
          req.url === "/company/admin-invitations/accept"
            ? { accepted: true }
            : req.url?.startsWith("/platform/companies?")
              ? { items: [company], page: 1, pageSize: 25, hasNext: false }
              : {
                  company: foreignResponse
                    ? { ...company, id: userId }
                    : company,
                },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing owned port");
  process.env.FLEETORA_API_URL = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (oldApi === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = oldApi;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test.beforeEach(() => {
  foreignResponse = false;
  role = "COMPANY_ADMIN";
  paths = [];
  writes = [];
});
test("company proxy rejects a response belonging to a different company", async () => {
  foreignResponse = true;
  const response = await handleCompany(
    request({ action: "profile", userId, companyId }),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unavailable" });
});
function request(
  input: unknown,
  origin = "http://localhost:3100",
  path = "/api/company",
) {
  return new NextRequest(`http://localhost:3100${path}`, {
    method: "POST",
    headers: {
      Origin: origin,
      Host: "localhost:3100",
      Cookie: "fleetora_access=fixture",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}
test("BR-068 own profile uses server-resolved company header and rejects protected fields", async () => {
  const input = {
    action: "save",
    userId,
    companyId,
    name: "Updated company",
    phone: "0591234567",
    address: "Address",
    revision: 1,
  };
  expect((await handleCompany(request(input))).status).toBe(200);
  expect(writes).toEqual([
    {
      path: "/company/profile",
      body: {
        name: input.name,
        phone: input.phone,
        address: input.address,
        revision: 1,
      },
      context: companyId,
    },
  ]);
  for (const field of [
    "currency",
    "plan",
    "approvalStatus",
    "suspended",
    "primaryAdminId",
  ])
    expect(
      (await handleCompany(request({ ...input, [field]: "ACTIVE" }))).status,
    ).toBe(400);
  expect(writes).toHaveLength(1);
});
test("company routes reject CSRF, stale identity, cross-company and staff privilege escalation before dispatch", async () => {
  const input = {
    action: "resubmit",
    userId,
    companyId,
    name: "Corrected",
    revision: 1,
  };
  expect(
    (await handleCompany(request(input, "https://evil.invalid"))).status,
  ).toBe(403);
  expect(paths).toEqual([]);
  expect(
    (await handleCompany(request({ ...input, userId: "other" }))).status,
  ).toBe(409);
  expect(
    (await handleCompany(request({ ...input, companyId: userId }))).status,
  ).toBe(409);
  role = "OPERATIONS";
  expect((await handleCompany(request(input))).status).toBe(403);
  role = "PLATFORM_ADMIN";
  expect((await handleCompany(request(input))).status).toBe(409);
  expect(writes).toEqual([]);
});
test("platform company reads are bounded and cannot be dispatched from company sessions", async () => {
  const input = {
    action: "companies",
    userId,
    page: 1,
    pageSize: 25,
    search: "مح",
    status: "PENDING",
  };
  expect((await handlePlatform(request(input))).status).toBe(403);
  role = "PLATFORM_ADMIN";
  expect(
    (await handlePlatform(request({ ...input, pageSize: 101 }))).status,
  ).toBe(400);
  expect(
    (await handlePlatform(request({ ...input, search: "a".repeat(101) })))
      .status,
  ).toBe(400);
  expect((await handlePlatform(request(input))).status).toBe(200);
  const url = new URL(paths.at(-1)!, "http://fixture.invalid");
  expect(url.searchParams.get("search")).toBe("مح");
  expect(url.searchParams.get("status")).toBe("PENDING");
});
test("primary admin activation sends credentials only in POST body with no authentication cookie forwarding", async () => {
  const token = "a".repeat(64),
    input = { token, name: "Primary admin", password: "StrongPassword1" };
  expect(
    (
      await activate(
        request(
          input,
          "http://localhost:3100",
          "/api/company/activate?token=" + token,
        ),
      )
    ).status,
  ).toBe(400);
  expect(paths).toEqual([]);
  expect(
    (
      await activate(
        request(
          { ...input, password: "weak" },
          "http://localhost:3100",
          "/api/company/activate",
        ),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await activate(
        request(input, "http://localhost:3100", "/api/company/activate"),
      )
    ).status,
  ).toBe(200);
  expect(paths).toEqual(["/company/admin-invitations/accept"]);
  expect(writes[0].body).toEqual(input);
});
