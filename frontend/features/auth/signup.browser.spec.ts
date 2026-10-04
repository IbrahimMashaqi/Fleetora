import { createServer, type Server } from "node:http";
import { test, expect, type Page } from "@playwright/test";

let server: Server;
let requests: unknown[];
let statusCode: number;
let responseBody: unknown;
let responseDelay: number;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    requests.push({ method: request.method, path: request.url, body: JSON.parse(raw) });
    await new Promise((resolve) => setTimeout(resolve, responseDelay));
    response.writeHead(statusCode, { "Content-Type": "application/json" });
    response.end(JSON.stringify(responseBody));
  });
  await new Promise<void>((resolve) => server.listen(3101, "127.0.0.1", resolve));
});

test.beforeEach(() => {
  requests = [];
  statusCode = 201;
  responseDelay = 0;
  responseBody = {
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
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
  );
});

async function fillSignup(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Amina Hassan");
  await page.getByLabel("Work email").fill("amina@example.com");
  await page.getByLabel("Password", { exact: true }).fill("Passw0rd");
}

test("submits through the Server Action and ends at email confirmation", async ({ page }) => {
  await fillSignup(page);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByText("amina@example.com", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  expect(requests).toEqual([{
    method: "POST", path: "/auth/signup",
    body: { name: "Amina Hassan", email: "amina@example.com", password: "Passw0rd" },
  }]);
  expect(new URL(page.url()).pathname).toBe("/signup");
  await expect(page.getByRole("link")).toHaveCount(0);
});

test("disables the form while signup is pending", async ({ page }) => {
  responseDelay = 1000;
  await fillSignup(page);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Creating account..." })).toBeDisabled();
  await expect(page.getByLabel("Work email")).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  expect(requests).toHaveLength(1);
});

test("keeps invalid inputs from reaching the backend", async ({ page }) => {
  await fillSignup(page);
  await page.getByLabel("Password", { exact: true }).fill("lowercase");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  expect(await page.getByLabel("Password", { exact: true }).evaluate((input: HTMLInputElement) => input.validity.patternMismatch)).toBe(true);
  expect(requests).toHaveLength(0);
});

test("shows duplicate email inline and retains non-sensitive input", async ({ page }) => {
  statusCode = 409;
  responseBody = { success: false, data: null, message: "Email already in use", timestamp: "2026-10-03T12:00:00.000Z" };
  await fillSignup(page);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("This email is already in use");
  await expect(page.getByLabel("Full name")).toHaveValue("Amina Hassan");
  await expect(page.getByLabel("Work email")).toHaveValue("amina@example.com");
  await expect(page.getByLabel("Work email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
});

test("shows a safe backend error and allows another attempt", async ({ page }) => {
  statusCode = 500;
  responseBody = { message: "postgres password=secret" };
  await fillSignup(page);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("We couldn't create your account");
  await expect(page.locator("body")).not.toContainText("postgres");
  statusCode = 201;
  responseBody = {
    success: true,
    data: { userId: "user-123", email: "amina@example.com", message: "Registered" },
    timestamp: "2026-10-03T12:00:00.000Z",
  };
  await page.getByLabel("Password", { exact: true }).fill("Passw0rd");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
});

test("supports password visibility, keyboard use, and a small viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await fillSignup(page);
  await page.getByRole("button", { name: "Show password" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.getByRole("button", { name: "Create account", exact: true }).evaluate((button) => getComputedStyle(button).backgroundColor)).toBe("rgb(15, 159, 149)");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeFocused();
});

test("frames account creation in the company workspace across desktop and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/signup");

  const formTitle = page.getByRole("heading", { name: "Create your account" });
  const workspaceTitle = page.getByRole("heading", { name: "Your company workspace" });
  await expect(formTitle).toBeVisible();
  await expect(workspaceTitle).toBeVisible();

  const desktopForm = await formTitle.boundingBox();
  const desktopWorkspace = await workspaceTitle.boundingBox();
  if (!desktopForm || !desktopWorkspace) throw new Error("Signup context is not visible on desktop.");
  expect(desktopForm.x).toBeGreaterThan(desktopWorkspace.x);

  await page.setViewportSize({ width: 375, height: 812 });
  const mobileForm = await formTitle.boundingBox();
  const mobileWorkspace = await workspaceTitle.boundingBox();
  if (!mobileForm || !mobileWorkspace) throw new Error("Signup context is not visible on mobile.");
  expect(mobileForm.y).toBeLessThan(mobileWorkspace.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
