import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import {
  resendVerificationAction,
  verifyEmailAction,
} from "./verification.action";

let server: Server;
let apiUrl: string;
let statusCode: number;
let responseBody: unknown;
let requests: {
  method: string | undefined;
  path: string | undefined;
  body: unknown;
}[];
const originalApiUrl = process.env.FLEETORA_API_URL;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    requests.push({
      method: request.method,
      path: request.url,
      body: raw ? JSON.parse(raw) : null,
    });
    response.writeHead(statusCode, { "Content-Type": "application/json" });
    response.end(JSON.stringify(responseBody));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Missing test server port");
  }
  apiUrl = `http://127.0.0.1:${address.port}`;
});

test.beforeEach(() => {
  process.env.FLEETORA_API_URL = apiUrl;
  statusCode = 200;
  requests = [];
  responseBody = {
    success: true,
    data: { message: "Email verified successfully. You can now sign in." },
    timestamp: "2026-10-03T12:00:00.000Z",
  };
});

test.afterAll(async () => {
  if (originalApiUrl === undefined) delete process.env.FLEETORA_API_URL;
  else process.env.FLEETORA_API_URL = originalApiUrl;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("verifies through the existing account-bound backend route", async () => {
  const token = "a".repeat(64);
  await expect(verifyEmailAction("user-123", token)).resolves.toEqual({
    status: "verified",
  });
  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe("GET");
  const requestUrl = new URL(requests[0].path!, apiUrl);
  expect(requestUrl.pathname).toBe("/auth/verify-email");
  expect(requestUrl.searchParams.get("userId")).toBe("user-123");
  expect(requestUrl.searchParams.get("token")).toBe(token);
});

test("maps expired, invalid, and already-verified responses", async () => {
  statusCode = 403;
  responseBody = {
    success: false,
    data: null,
    message: "Verification code has expired. Please request a new one.",
  };
  await expect(verifyEmailAction("user-123", "a".repeat(64))).resolves.toEqual({
    status: "expired",
  });

  responseBody = {
    success: false,
    data: null,
    message: "Invalid verification code",
  };
  await expect(verifyEmailAction("user-123", "a".repeat(64))).resolves.toEqual({
    status: "invalid",
  });

  statusCode = 200;
  responseBody = {
    success: true,
    data: { message: "Email is already verified. You can sign in." },
  };
  await expect(verifyEmailAction("user-123", "a".repeat(64))).resolves.toEqual({
    status: "already-verified",
  });
});

test("rejects incomplete links before contacting the backend", async () => {
  await expect(verifyEmailAction("user-123", "not-a-token")).resolves.toEqual({
    status: "invalid",
  });
  await expect(verifyEmailAction("", "a".repeat(64))).resolves.toEqual({
    status: "invalid",
  });
  expect(requests).toHaveLength(0);
});

test("resends to the linked account and recognizes the server cooldown", async () => {
  responseBody = {
    success: true,
    data: { message: "Verification code sent. Please check your email." },
  };
  await expect(resendVerificationAction("user-123")).resolves.toEqual({
    status: "sent",
  });
  expect(requests[0]).toMatchObject({
    method: "POST",
    path: "/auth/resend-verification",
    body: { userId: "user-123" },
  });

  statusCode = 429;
  responseBody = {
    success: false,
    data: null,
    message:
      "Please wait 42 seconds before requesting another verification email.",
  };
  await expect(resendVerificationAction("user-123")).resolves.toEqual({
    status: "rate-limited",
    retryAfterSeconds: 42,
  });
});
