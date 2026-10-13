import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { loginAction } from "./login/login.action";
import { signupAction } from "./signup/signup.action";
import { forgotPasswordAction, resetPasswordAction } from "./password-recovery/password-recovery.action";
import { verifyEmailAction, resendVerificationAction } from "./verification/verification.action";

let server: Server;
let url: string;
let status = 200;
let raw = "";
let disconnect = false;
let stall = false;
const original = process.env.FLEETORA_API_URL;
const id = "11111111-1111-4111-8111-111111111111";
function form() {
  const data = new FormData();
  data.set("name", "Fixture"); data.set("email", "errors@example.invalid");
  data.set("password", "FixturePassword1"); data.set("confirmPassword", "FixturePassword1");
  return data;
}
async function workflows() {
  return Promise.all([
    loginAction({ status: "idle" }, form()), signupAction({ status: "idle" }, form()),
    forgotPasswordAction({ status: "idle" }, form()), resetPasswordAction(id, "a".repeat(64), { status: "idle" }, form()),
    verifyEmailAction(id, "a".repeat(64)), resendVerificationAction(id),
  ]);
}
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    if (disconnect) { req.socket.destroy(); return; }
    if (stall) return;
    res.writeHead(status, { "Content-Type": "application/json" }); res.end(raw);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing loopback fixture port");
  url = `http://127.0.0.1:${address.port}`;
});
test.beforeEach(() => {
  process.env.FLEETORA_API_URL = url;
  status = 200; raw = JSON.stringify({ success: true, data: { message: "Acknowledged" } }); disconnect = false; stall = false;
});
test.afterAll(async () => {
  if (original === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = original;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

for (const configuration of [undefined, "invalid-backend-url"]) {
  test(`all workflows recover from ${configuration ? "invalid" : "missing"} server configuration`, async () => {
    if (configuration === undefined) delete process.env.FLEETORA_API_URL;
    else process.env.FLEETORA_API_URL = configuration;
    const results = await workflows();
    expect(results.every(result => result.status === "error")).toBe(true);
    expect(JSON.stringify(results)).not.toContain("invalid-backend-url");
  });
}

for (const code of [400, 401, 403, 409, 429, 500, 503]) {
  test(`normalizes backend ${code} without leaking backend details`, async () => {
    status = code; raw = JSON.stringify({ success: false, message: "private-provider-detail" });
    const results = await workflows();
    expect(results.every(result => result.status === "error" || result.status === "rate-limited")).toBe(true);
    expect(JSON.stringify(results)).not.toContain("private-provider-detail");
    if (code >= 500) expect(JSON.stringify(results[0])).not.toMatch(/those details|credentials|verify your email/i);
    if (code === 429) expect(results[5]).toMatchObject({ status: "rate-limited", retryAfterSeconds: 60 });
  });
}

for (const response of ["not-json", JSON.stringify({ success: false }), JSON.stringify({ success: true, data: {} })]) {
  test(`does not report successful workflows for malformed response ${response}`, async () => {
    raw = response;
    expect((await workflows()).every(result => result.status === "error")).toBe(true);
  });
}

test("keeps service failures separate from verification expiration", async () => {
  status = 503; raw = JSON.stringify({ success: false, message: "provider credentials expired" });
  expect(await verifyEmailAction(id, "a".repeat(64))).toEqual({ status: "error" });
});
test("recovers from an actual disconnected backend connection", async () => {
  disconnect = true;
  expect((await workflows()).every(result => result.status === "error")).toBe(true);
});
test("recovers after actual transport timeouts", async () => {
  stall = true;
  expect((await workflows()).every(result => result.status === "error")).toBe(true);
});

test("recovers from connection refusal on a fixture-owned closed port", async () => {
  const closed = createServer();
  await new Promise<void>(resolve => closed.listen(0, "127.0.0.1", resolve));
  const address = closed.address();
  if (!address || typeof address === "string") throw new Error("Missing closed fixture port");
  await new Promise<void>(resolve => closed.close(() => resolve()));
  process.env.FLEETORA_API_URL = `http://127.0.0.1:${address.port}`;
  expect((await workflows()).every(result => result.status === "error")).toBe(true);
});

test("preserves valid signup, verification, resend and recovery acknowledgements", async () => {
  raw = JSON.stringify({ success: true, data: { userId: id, email: "errors@example.invalid" } });
  expect(await signupAction({ status: "idle" }, form())).toEqual({ status: "success", email: "errors@example.invalid" });
  raw = JSON.stringify({ success: true, data: { message: "Email verified successfully. You can now sign in." } });
  expect(await verifyEmailAction(id, "a".repeat(64))).toEqual({ status: "verified" });
  raw = JSON.stringify({ success: true, data: { message: "Verification code sent." } });
  expect(await resendVerificationAction(id)).toEqual({ status: "sent" });
  raw = JSON.stringify({ success: true, data: { message: "If an account exists, instructions will be sent." } });
  expect(await forgotPasswordAction({ status: "idle" }, form())).toEqual({ status: "success" });
  raw = JSON.stringify({ success: true, data: { message: "Password updated successfully" } });
  await expect(resetPasswordAction(id, "a".repeat(64), { status: "idle" }, form())).rejects.toMatchObject({ digest: expect.stringContaining("/login?password=reset") });
});
