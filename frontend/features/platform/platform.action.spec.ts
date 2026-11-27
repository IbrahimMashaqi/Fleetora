import { createServer, type Server } from "node:http";
import { NextRequest } from "next/server";
import { expect, test } from "@playwright/test";
import { handlePlatform } from "./platform.route";
import { POST as activate } from "@/app/api/platform/activate/route";
const userId = "10000000-0000-4000-8000-000000000001";
let server: Server,
  oldApi: string | undefined,
  company: boolean,
  paths: string[],
  status: number;
test.beforeAll(async () => {
  oldApi = process.env.FLEETORA_API_URL;
  server = createServer(async (req, res) => {
    paths.push(req.url ?? "");
    res.setHeader("Content-Type", "application/json");
    req.resume();
    if (req.url === "/auth/session")
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            id: userId,
            name: "Fixture",
            email: null,
            role: company ? "COMPANY_ADMIN" : "PLATFORM_ADMIN",
            orgId: company ? userId : null,
            company: company
              ? { id: userId, name: "Company", currency: "ILS" }
              : null,
          },
        }),
      );
    if (status !== 200)
      return res
        .writeHead(status)
        .end(
          JSON.stringify({
            message:
              status === 409
                ? "Keep at least one active Super Admin"
                : "private infrastructure error",
          }),
        );
    if (req.url === "/platform/me")
      return res.end(
        JSON.stringify({
          success: true,
          data: { userId, name: "Fixture", email: null, role: "SUPPORT" },
        }),
      );
    return res.end(JSON.stringify({ success: true, data: { accepted: true } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test port");
  process.env.FLEETORA_API_URL = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (oldApi === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = oldApi;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test.beforeEach(() => {
  paths = [];
  company = false;
  status = 200;
});
function request(
  input: unknown,
  origin = "http://localhost:3100",
  path = "/api/platform",
) {
  return new NextRequest(`http://localhost:3100${path}`, {
    method: "POST",
    headers: {
      Host: "localhost:3100",
      Origin: origin,
      Cookie: "fleetora_access=fixture",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}
test("OD-15 platform route reads own identity and uses private responses", async () => {
  const response = await handlePlatform(request({ action: "me", userId }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({
    status: "ready",
    data: { userId, role: "SUPPORT" },
  });
});
test("OD-15 rejects cross-origin, arbitrary paths, roles and changed identities", async () => {
  expect(
    (
      await handlePlatform(
        request({ action: "me", userId }, "https://evil.invalid"),
      )
    ).status,
  ).toBe(403);
  expect(paths).toEqual([]);
  expect(
    (await handlePlatform(request({ action: "../company/staff", userId })))
      .status,
  ).toBe(400);
  expect(
    (
      await handlePlatform(
        request({
          action: "invite",
          email: "x@example.invalid",
          role: "COMPANY_ADMIN",
          userId,
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (await handlePlatform(request({ action: "me", userId: "other" }))).status,
  ).toBe(409);
  expect(paths).toEqual(["/auth/session"]);
});
test("OD-15 company sessions cannot dispatch platform reads or writes", async () => {
  company = true;
  for (const action of ["me", "staff", "audit"])
    expect((await handlePlatform(request({ action, userId }))).status).toBe(
      403,
    );
  expect(
    (
      await handlePlatform(
        request({
          action: "invite",
          userId,
          email: "x@example.invalid",
          role: "SUPER_ADMIN",
        }),
      )
    ).status,
  ).toBe(403);
  expect(paths.every((path) => path === "/auth/session")).toBe(true);
});
test("OD-15 preserves last-admin rejection and hides upstream infrastructure errors", async () => {
  status = 409;
  const response = await handlePlatform(
    request({
      action: "update",
      userId,
      id: userId,
      role: "SUPPORT",
      active: false,
    }),
  );
  expect(await response.json()).toEqual({ status: "last-admin" });
  status = 500;
  const failed = await handlePlatform(request({ action: "me", userId }));
  expect(await failed.json()).toEqual({ status: "unavailable" });
});
test("OD-15 activation rejects query tokens, cross-origin and weak credentials without contacting backend", async () => {
  const input = {
    token: "a".repeat(64),
    name: "Owner",
    password: "StrongPass1",
  };
  expect(
    (
      await activate(
        request(input, "https://evil.invalid", "/api/platform/activate"),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await activate(
        request(input, undefined, "/api/platform/activate?token=secret"),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await activate(
        request(
          { ...input, password: "weak" },
          undefined,
          "/api/platform/activate",
        ),
      )
    ).status,
  ).toBe(400);
  expect(paths).toEqual([]);
  const response = await activate(
    request(input, undefined, "/api/platform/activate"),
  );
  expect(await response.json()).toEqual({ status: "accepted" });
  expect(paths).toEqual(["/platform/invitations/accept"]);
});
