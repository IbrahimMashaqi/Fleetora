import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";

let server: Server;
let verificationStatus: number;
let verificationBody: unknown;
let resendStatus: number;
let resendBody: unknown;
let requests: {
  method: string | undefined;
  path: string | undefined;
  body: unknown;
}[];

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    requests.push({
      method: request.method,
      path: request.url,
      body: raw ? JSON.parse(raw) : null,
    });

    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const [status, responseBody] =
      path === "/auth/resend-verification"
        ? [resendStatus, resendBody]
        : [verificationStatus, verificationBody];
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(responseBody));
  });
  await new Promise<void>((resolve) => server.listen(3101, "127.0.0.1", resolve));
});

test.beforeEach(() => {
  requests = [];
  verificationStatus = 200;
  verificationBody = {
    success: true,
    data: { message: "Email verified successfully. You can now sign in." },
    timestamp: "2026-10-03T12:00:00.000Z",
  };
  resendStatus = 200;
  resendBody = {
    success: true,
    data: { message: "Verification code sent. Please check your email." },
  };
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

const verificationLink = "/auth/verify-email?userId=user-123";
const verifyUrl = `${verificationLink}#token=${"a".repeat(64)}`;

async function confirmVerification(page: import("@playwright/test").Page) {
  const confirm = page.getByRole("button", { name: "Confirm email address" });
  await expect(confirm).toBeEnabled({ timeout: 15_000 });
  await confirm.click();
}

test("verifies the email and shows the success state on a narrow viewport", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 375, height: 812 });
  const response = await page.goto(verifyUrl);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm email address" })).toBeVisible();
  expect(requests).toHaveLength(0);
  await confirmVerification(page);
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await expect(page.locator(".auth-success-mark")).toHaveCSS("animation-name", "auth-success-mark");
  await expect(page.locator(".auth-success-state")).toHaveCSS("animation-name", "auth-success-state");
  await expect(
    page.getByText("Your email address has been confirmed."),
  ).toBeVisible();
  const continueToLogin = page.getByRole("link", {
    name: "Continue to Login",
  });
  await expect(continueToLogin).toBeVisible();
  await expect(continueToLogin).toHaveAttribute("href", "/login");
  expect(requests[0]).toMatchObject({
    method: "POST",
    path: "/auth/verify-email",
    body: { userId: "user-123", token: "a".repeat(64) },
  });
  for (const size of [{ width: 1280, height: 900 }, { width: 768, height: 900 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(size);
    await page.goto(`${verificationLink}&viewport=${size.width}#token=${"a".repeat(64)}`);
    await confirmVerification(page);
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await continueToLogin.click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("shows an expired-link state and allows another email to be requested", async ({
  page,
}) => {
  verificationStatus = 403;
  verificationBody = {
    success: false,
    data: null,
    message: "Verification code has expired. Please request a new one.",
  };
  await page.goto(verifyUrl);
  await confirmVerification(page);
  await expect(
    page.getByRole("heading", { name: "This link has expired" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue to Login" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Resend verification email" }).click();
  await expect(
    page.getByText("A new verification email has been sent.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Resend email in/ }),
  ).toBeDisabled();
  expect(
    requests.some(
      (request) =>
        request.method === "POST" &&
        request.path === "/auth/resend-verification" &&
        JSON.stringify(request.body) === JSON.stringify({ userId: "user-123" }),
    ),
  ).toBe(true);
});

test("shows the backend resend cooldown", async ({ page }) => {
  verificationStatus = 403;
  verificationBody = {
    success: false,
    data: null,
    message: "Invalid verification code",
  };
  resendStatus = 429;
  resendBody = {
    success: false,
    data: null,
    message:
      "Please wait 42 seconds before requesting another verification email.",
  };

  await page.goto(verifyUrl);
  await confirmVerification(page);
  await page.getByRole("button", { name: "Resend verification email" }).click();
  await expect(
    page.getByRole("button", { name: "Resend email in 42s" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Please wait before requesting another verification email."),
  ).toBeVisible();
});

test("does not offer Login when the verification service fails", async ({
  page,
}) => {
  verificationStatus = 503;
  verificationBody = {
    success: false,
    data: null,
    message: "Verification service unavailable",
  };

  await page.goto(verifyUrl);
  await confirmVerification(page);
  await expect(
    page.getByRole("heading", { name: /verify your email/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue to Login" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("shows invalid and already-verified states distinctly", async ({ page }) => {
  verificationStatus = 403;
  verificationBody = {
    success: false,
    data: null,
    message: "Invalid verification code",
  };
  await page.goto(verifyUrl);
  await confirmVerification(page);
  await expect(
    page.getByRole("heading", { name: "This link isn’t valid" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resend verification email" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue to Login" }),
  ).toHaveCount(0);

  verificationStatus = 200;
  verificationBody = {
    success: true,
    data: { message: "Email is already verified. You can sign in." },
  };
  await page.goto(`${verificationLink}&retry=already-verified#token=${"a".repeat(64)}`);
  await confirmVerification(page);
  await expect(
    page.getByRole("heading", { name: "Email already verified" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue to Login" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue to Login" }),
  ).toHaveAttribute("href", "/login");
});

test("legacy query-token links are never redeemed by scanner-like GET requests", async ({ page }) => {
  await page.goto(`/auth/verify-email?userId=user-123&token=${"a".repeat(64)}`);

  await expect(page.getByRole("heading", { name: "This link isn’t valid" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resend verification email" })).toBeVisible();
  expect(requests).toHaveLength(0);
});
