import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { signupAction } from "./signup.action";

let server: Server;
let apiUrl: string;
let statusCode = 201;
let body: unknown;
let disconnect = false;
let requests: { method: string | undefined; path: string | undefined; body: unknown }[];
const originalApiUrl = process.env.FLEETORA_API_URL;

function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    name: "Amina Hassan",
    email: "amina@example.com",
    password: "Passw0rd",
    ...values,
  })) {
    data.set(key, value);
  }
  return data;
}

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    requests.push({
      method: request.method,
      path: request.url,
      body: JSON.parse(raw),
    });
    if (disconnect) {
      request.socket.destroy();
      return;
    }
    response.writeHead(statusCode, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test port");
  apiUrl = `http://127.0.0.1:${address.port}`;
});

test.beforeEach(() => {
  process.env.FLEETORA_API_URL = apiUrl;
  statusCode = 201;
  disconnect = false;
  requests = [];
  body = {
    success: true,
    data: {
      message: "User registered successfully. Please check your email for verification code.",
      userId: "user-123",
      email: "amina@example.com",
    },
    timestamp: "2026-10-03T12:00:00.000Z",
  };
});

test.afterAll(async () => {
  if (originalApiUrl === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = originalApiUrl;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
  );
});

test("posts only the verified signup fields and returns email confirmation without credentials", async () => {
  const result = await signupAction({ status: "idle" }, form({ companyId: "other-company", role: "PLATFORM_ADMIN" }));
  expect(result).toEqual({ status: "success", email: "amina@example.com" });
  expect(requests).toEqual([{
    method: "POST",
    path: "/auth/signup",
    body: { name: "Amina Hassan", email: "amina@example.com", password: "Passw0rd" },
  }]);
  expect(JSON.stringify(result)).not.toContain("Passw0rd");
});

test("rejects invalid form fields before contacting the backend", async () => {
  const result = await signupAction({ status: "idle" }, form({ name: "A", email: "invalid", password: "weak" }));
  expect(result).toMatchObject({
    status: "error",
    fieldErrors: { name: expect.any(String), email: expect.any(String), password: expect.any(String) },
  });
  expect(requests).toHaveLength(0);
});

test("associates an existing email response with the email field", async () => {
  statusCode = 409;
  body = { success: false, data: null, message: "Email already in use", timestamp: "2026-10-03T12:00:00.000Z" };
  expect(await signupAction({ status: "idle" }, form())).toMatchObject({
    status: "error", fieldErrors: { email: expect.any(String) },
  });
});

test("keeps backend internals out of the returned error", async () => {
  statusCode = 500;
  body = { message: "postgres password=secret" };
  const result = await signupAction({ status: "idle" }, form());
  expect(result).toMatchObject({ status: "error", message: expect.any(String) });
  expect(JSON.stringify(result)).not.toMatch(/postgres|secret|Passw0rd/);
});

test("does not show success for a malformed backend response", async () => {
  body = { success: true, data: null };
  expect(await signupAction({ status: "idle" }, form())).toMatchObject({
    status: "error", message: expect.any(String),
  });
});

test("returns a recoverable error when the backend connection fails", async () => {
  disconnect = true;
  expect(await signupAction({ status: "idle" }, form())).toMatchObject({
    status: "error", message: expect.any(String),
  });
});

test("fails safely when the backend URL is missing", async () => {
  delete process.env.FLEETORA_API_URL;
  expect(await signupAction({ status: "idle" }, form())).toMatchObject({
    status: "error", message: expect.any(String),
  });
  expect(requests).toHaveLength(0);
});
