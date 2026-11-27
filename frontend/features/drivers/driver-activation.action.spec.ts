import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/driver/activate/route";

let backend: Server, status: number, message: unknown, calls: number;
const token = "e".repeat(64);
const previous = process.env.FLEETORA_API_URL;
test.beforeAll(async () => {
  backend = createServer((req, res) => {
    req.resume(); // Drain synthetic credentials without retaining or logging them.
    calls++;
    res
      .writeHead(status, { "Content-Type": "application/json" })
      .end(
        JSON.stringify({
          success: status === 200,
          message,
          data: { accepted: true },
        }),
      );
  });
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const address = backend.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  process.env.FLEETORA_API_URL = `http://127.0.0.1:${address.port}`;
});
test.beforeEach(() => {
  status = 200;
  message = undefined;
  calls = 0;
});
test.afterAll(async () => {
  if (previous === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = previous;
  backend.closeAllConnections();
  await new Promise<void>((resolve) => backend.close(() => resolve()));
});
function request(password = "Driver123") {
  return new NextRequest("http://127.0.0.1:3000/api/driver/activate", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:3000",
      host: "127.0.0.1:3000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, password }),
  });
}
for (const [code, reason, expected] of [
  [400, "Driver invitation expired", "expired"],
  [400, "Driver invitation already used or revoked", "used-or-revoked"],
  [400, ["Password must not exceed 72 UTF-8 bytes"], "password-rules"],
  [409, "This phone already has a driver account", "phone-in-use"],
  [429, "Too many activation attempts", "limited"],
  [404, "Cannot POST /driver/invitations/accept", "unavailable"],
] as const) {
  test(`activation preserves the specific ${expected} outcome`, async () => {
    status = code;
    message = reason;
    const response = await POST(request());
    expect(await response.json()).toEqual({ status: expected });
    expect(calls).toBe(1);
  });
}
test("weak and oversized multibyte passwords list policy failure without backend dispatch", async () => {
  for (const password of ["weak", "lowercase", "A" + "ع".repeat(36)]) {
    const response = await POST(request(password));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: "password-rules" });
  }
  expect(calls).toBe(0);
});
test("unknown infrastructure diagnostics never expose raw details or submitted credentials", async () => {
  status = 500;
  message = "private infrastructure diagnostic";
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unavailable" });
});
test("accepted activation returns only a confirmation, without credentials", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "accepted" });
});
test("cross-origin activation requests are denied before backend dispatch", async () => {
  const unsafe = request();
  unsafe.headers.set("origin", "https://other.example");
  const response = await POST(unsafe);
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ status: "request-rejected" });
  expect(calls).toBe(0);
});
