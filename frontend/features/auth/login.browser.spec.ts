import { createServer, type Server } from "node:http";
import { test, expect, type Page } from "@playwright/test";
import { isSessionUser } from "./login.types";

let server: Server;
let requests: { method?: string; path?: string; authorization?: string; body: unknown }[];
let signinStatus: number;
let signinMessage: string;
let sessionStatus: number;
let sessionCalls: number;
let expireFirstSession: boolean;
let refreshStatus: number;
let logoutStatus: number;
let forgotPasswordStatus: number;
let resetPasswordStatus: number;
let includeSessionSecrets: boolean;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    requests.push({ method: request.method, path: request.url, authorization: request.headers.authorization, body });
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/auth/signin") {
      response.writeHead(signinStatus);
      response.end(JSON.stringify(signinStatus === 200
        ? { success: true, data: { accessToken: "access-secret", refreshToken: "refresh-secret", user: { id: "u1" } } }
        : { success: false, message: signinMessage }));
      return;
    }
    if (request.url === "/auth/forgot-password") {
      response.writeHead(forgotPasswordStatus);
      response.end(JSON.stringify(forgotPasswordStatus === 200
        ? { success: true, data: { message: "If an account exists for this email, password reset instructions will be sent." } }
        : { success: false, message: "Password recovery is temporarily unavailable" }));
      return;
    }
    if (request.url === "/auth/reset-password") {
      response.writeHead(resetPasswordStatus);
      response.end(JSON.stringify(resetPasswordStatus === 200
        ? { success: true, data: { message: "Password updated successfully" } }
        : { success: false, message: "Invalid verification code" }));
      return;
    }
    if (request.url === "/auth/session") {
      sessionCalls++;
      if (expireFirstSession) {
        expireFirstSession = false;
        response.writeHead(401);
        response.end(JSON.stringify({ success: false, message: "Expired" }));
        return;
      }
      response.writeHead(sessionStatus);
      const sessionUser = {
        id: "u1", name: "Amina Hassan", email: "amina@example.com", role: "COMPANY_ADMIN",
        orgId: "org1", company: { id: "org1", name: "Amina Logistics" },
      };
      response.end(JSON.stringify(sessionStatus === 200
        ? { success: true, data: includeSessionSecrets ? { ...sessionUser, password: "password-hash", refreshToken: "refresh-hash", verificationToken: "verification-token" } : sessionUser }
        : { success: false, message: "Invalid session" }));
      return;
    }
    if (request.url === "/auth/refresh") {
      response.writeHead(refreshStatus);
      response.end(JSON.stringify(refreshStatus === 200
        ? { success: true, data: { accessToken: "rotated-access", refreshToken: "rotated-refresh" } }
        : { success: false, message: "Refresh token has already rotated" }));
      return;
    }
    if (request.url === "/auth/logout") {
      response.writeHead(logoutStatus);
      response.end(JSON.stringify(logoutStatus === 200
        ? { success: true, data: { message: "Logged out" } }
        : { success: false, message: "Internal revocation failure" }));
      return;
    }
    response.writeHead(404);
    response.end(JSON.stringify({ success: false }));
  });
  await new Promise<void>((resolve) => server.listen(3101, "127.0.0.1", resolve));
});

test.beforeEach(() => {
  requests = [];
  signinStatus = 200;
  signinMessage = "Invalid credentials";
  sessionStatus = 200;
  sessionCalls = 0;
  expireFirstSession = false;
  refreshStatus = 200;
  logoutStatus = 200;
  forgotPasswordStatus = 200;
  resetPasswordStatus = 200;
  includeSessionSecrets = false;
});

test("validates the expanded session contract and nullable email", () => {
  expect(isSessionUser({
    id: "u1", name: "Amina Hassan", email: null, role: "COMPANY_ADMIN", orgId: "org1",
    company: { id: "org1", name: "Amina Logistics" },
  })).toBe(true);
  expect(isSessionUser({
    id: "admin1", name: "Platform Admin", email: null, role: "PLATFORM_ADMIN", orgId: null,
    company: null,
  })).toBe(true);
});

test("rejects malformed company context, mismatched tenant identity, and unsupported roles", () => {
  const session = {
    id: "u1", name: "Amina Hassan", email: "amina@example.com", role: "COMPANY_ADMIN", orgId: "org1",
    company: { id: "org1", name: "Amina Logistics" },
  };
  expect(isSessionUser({ ...session, company: { id: "org1", name: 4 } })).toBe(false);
  expect(isSessionUser({ ...session, company: { ...session.company, id: "org2" } })).toBe(false);
  expect(isSessionUser({ ...session, role: "ROOT_ADMIN" })).toBe(false);
  expect(isSessionUser({ ...session, email: undefined })).toBe(false);
});

test("returns only public session fields even if the backend includes secret fields", async ({ page }) => {
  includeSessionSecrets = true;
  await fillLogin(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/auth/session", {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    return { body: await response.json(), cacheControl: response.headers.get("cache-control") };
  });
  expect(result.body).toMatchObject({ user: {
    id: "u1", name: "Amina Hassan", role: "COMPANY_ADMIN", orgId: "org1",
    company: { id: "org1", name: "Amina Logistics" },
  } });
  expect(JSON.stringify(result)).not.toMatch(/password-hash|refresh-hash|verification-token/);
  expect(result.cacheControl).toContain("private, no-store");
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function fillLogin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill("amina@example.com");
  await page.getByLabel("Password", { exact: true }).fill("Passw0rd");
}

test("signs in, stores credentials in HttpOnly cookies, and opens the authenticated entry route", async ({ page }) => {
  await fillLogin(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
  expect(requests[0]).toMatchObject({ method: "POST", path: "/auth/signin", body: { email: "amina@example.com", password: "Passw0rd" } });
  const cookies = await page.context().cookies();
  expect(cookies.filter((cookie) => cookie.name.startsWith("fleetora_")).map(({ name, httpOnly, sameSite }) => ({ name, httpOnly, sameSite }))).toEqual([
    { name: "fleetora_access", httpOnly: true, sameSite: "Lax" },
    { name: "fleetora_refresh", httpOnly: true, sameSite: "Lax" },
  ]);
  expect(await page.evaluate(() => document.cookie)).not.toMatch(/fleetora_(access|refresh)/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
  expect(sessionCalls).toBeGreaterThanOrEqual(2);
});

test("shows a safe incorrect-credentials error without exposing backend details", async ({ page }) => {
  signinStatus = 401;
  signinMessage = "postgres password=secret";
  await fillLogin(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("We couldn't sign you in");
  await expect(page.locator("body")).not.toContainText("postgres");
  expect(await page.context().cookies()).toEqual([]);
});

test("shows the verification prompt for a correctly authenticated unverified account", async ({ page }) => {
  signinStatus = 403;
  await fillLogin(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Please verify your email");
});

test("refreshes an expired access token and stores the rotated token pair", async ({ page }) => {
  expireFirstSession = true;
  await fillLogin(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
  expect(requests.some((request) => request.path === "/auth/refresh" && request.authorization === "Bearer refresh-secret")).toBe(true);
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === "fleetora_access")?.value).toBe("rotated-access");
  expect(cookies.find((cookie) => cookie.name === "fleetora_refresh")?.value).toBe("rotated-refresh");
});

test("preserves cookies when a competing request has already rotated the refresh token", async ({ page }) => {
  expireFirstSession = true;
  sessionStatus = 401;
  refreshStatus = 403;
  await fillLogin(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect.poll(() => requests.some((request) => request.path === "/auth/refresh")).toBe(true);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("Your session changed while it was being checked. Please try again.")).toBeVisible();
  expect((await page.context().cookies()).filter((cookie) => cookie.name.startsWith("fleetora_"))).toHaveLength(2);
});

test("redirects unauthenticated and expired sessions to Login", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
  await fillLogin(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
  sessionStatus = 401;
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
});

test("logs out and clears both session cookies", async ({ page }) => {
  await fillLogin(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.context().cookies()).filter((cookie) => cookie.name.startsWith("fleetora_"))).toEqual([]);
  expect(requests.some((request) => request.path === "/auth/logout")).toBe(true);
});

test("clears local cookies and reports when server-side logout cannot be confirmed", async ({ page }) => {
  await fillLogin(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
  logoutStatus = 503;
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login\?logout=unconfirmed$/);
  expect((await page.context().cookies()).filter((cookie) => cookie.name.startsWith("fleetora_"))).toEqual([]);
  await expect(page.locator("main").getByText("You're signed out on this device.", { exact: false })).toContainText("couldn't confirm that the server ended the session");
  await expect(page.locator("body")).not.toContainText("Internal revocation failure");
});

test("supports keyboard use and responsive layouts without horizontal overflow", async ({ page }) => {
  for (const size of [{ width: 1280, height: 900 }, { width: 768, height: 900 }, { width: 375, height: 640 }]) {
    await page.setViewportSize(size);
    await page.goto("/login");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  const show = page.getByRole("button", { name: "Show password" });
  await expect(show).toHaveText("");
  await expect(show.locator("svg[aria-hidden='true']")).toHaveCount(1);
  await show.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  const hide = page.getByRole("button", { name: "Hide password" });
  await expect(hide).toHaveText("");
  await expect(hide.locator("svg[aria-hidden='true']")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup");
});

test("keeps primary text, recovery links, and form boundaries above accessibility contrast thresholds", async ({ page }) => {
  await page.goto("/login");
  const ratios = await page.evaluate(() => {
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
      const linear = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const contrast = (foreground: string, background: string) => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const submit = document.querySelector<HTMLButtonElement>("button[type=submit]")!;
    const forgot = document.querySelector<HTMLAnchorElement>('a[href="/forgot-password"]')!;
    const input = document.querySelector<HTMLInputElement>("#login-email")!;
    const buttonStyle = getComputedStyle(submit);
    const forgotStyle = getComputedStyle(forgot);
    const inputStyle = getComputedStyle(input);
    return {
      buttonText: contrast(buttonStyle.color, buttonStyle.backgroundColor),
      linkText: contrast(forgotStyle.color, getComputedStyle(document.querySelector("section")!).backgroundColor),
      inputBoundary: contrast(inputStyle.borderTopColor, inputStyle.backgroundColor),
    };
  });
  expect(ratios.buttonText).toBeGreaterThanOrEqual(4.5);
  expect(ratios.linkText).toBeGreaterThanOrEqual(4.5);
  expect(ratios.inputBoundary).toBeGreaterThanOrEqual(3);
});

test("uses restrained authentication motion and respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/login");

  const card = page.locator("main section");
  const submit = page.getByRole("button", { name: "Sign in", exact: true });
  const email = page.getByLabel("Work email");
  await expect(card).toHaveCSS("animation-name", "auth-enter");
  await expect.poll(() => submit.evaluate((button) => getComputedStyle(button).transitionDuration.split(",")[0].trim())).toBe("0.18s");
  await expect.poll(() => email.evaluate((input) => getComputedStyle(input).transitionDuration.split(",")[0].trim())).toBe("0.18s");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(card).toHaveCSS("animation-name", "none");
  await expect.poll(() => submit.evaluate((button) => getComputedStyle(button).transitionDuration.split(",")[0].trim())).toBe("0s");
  await expect.poll(() => email.evaluate((input) => getComputedStyle(input).transitionDuration.split(",")[0].trim())).toBe("0s");
});

test("shows the route illustration beside the form on desktop and below it on smaller screens", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });

  for (const size of [{ width: 1280, height: 900 }, { width: 768, height: 900 }, { width: 375, height: 640 }]) {
    await page.setViewportSize(size);
    await page.goto("/login");
    const visual = page.getByTestId("login-route-panel");
    const form = page.getByRole("region", { name: "Welcome back" });
    const visualBox = await visual.boundingBox();
    const formBox = await form.boundingBox();

    await expect(visual).toBeVisible();
    if (!visualBox || !formBox) throw new Error("Login visual and form panels should be visible.");
    if (size.width >= 1024) expect(visualBox.x).toBeLessThan(formBox.x);
    else expect(visualBox.y).toBeGreaterThan(formBox.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("animates the authored route and keeps a static signal when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/login");
  await expect(page.getByRole("img", { name: "Route from pickup through transfer and handoff to delivery" })).toBeVisible();
  const signal = page.locator("svg.login-route-map-desktop .login-route-signal");
  await expect(signal.locator("animateMotion")).toHaveCount(1);
  await expect(page.locator(".login-route-node-pulse").first()).toHaveCSS("animation-name", "login-route-pulse");
  const positionBefore = await signal.evaluate((element) => {
    const matrix = (element as SVGCircleElement).getCTM();
    return matrix ? [matrix.e, matrix.f] : null;
  });
  await page.waitForTimeout(500);
  const positionAfter = await signal.evaluate((element) => {
    const matrix = (element as SVGCircleElement).getCTM();
    return matrix ? [matrix.e, matrix.f] : null;
  });
  expect(positionBefore).not.toBeNull();
  expect(positionAfter).not.toEqual(positionBefore);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(signal).toHaveCSS("display", "none");
  await expect(page.locator("svg.login-route-map-desktop .login-route-signal-static")).toHaveCSS("display", "block");
  await expect(page.locator("svg.login-route-map-desktop .login-route-node-pulse").first()).toHaveCSS("display", "none");
});

test("softens the desktop panel seam and blends the header into the form surface", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/login");

  const panel = page.getByTestId("login-route-panel");
  const seam = await panel.evaluate((element) => getComputedStyle(element, "::after").content);
  expect(seam).not.toBe("none");
  await expect(page.locator(".login-route-map-desktop .login-route-seam-path")).toHaveCount(1);

  const headerBackground = await page.locator("main header").evaluate((element) => getComputedStyle(element).backgroundColor);
  const formBackground = await page.locator("main > div > div:nth-child(2)").evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(headerBackground).toBe(formBackground);

  await page.setViewportSize({ width: 375, height: 640 });
  await page.goto("/login");
  const mobileSeam = await page.getByTestId("login-route-panel").evaluate((element) => getComputedStyle(element, "::after").content);
  expect(mobileSeam).toBe("none");
});

test("fits the standard desktop viewport and still scrolls naturally on mobile", async ({ page }) => {
  for (const size of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    await page.goto("/login");
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  }

  await page.setViewportSize({ width: 375, height: 640 });
  await page.goto("/login");
  expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
});

test("connects the Forgot Password link to the existing email recovery flow", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/, { timeout: 20_000 });
  await page.getByLabel("Work email").fill("amina@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account matches that email, a reset link is on its way.");
  expect(requests.find((request) => request.path === "/auth/forgot-password")).toMatchObject({
    method: "POST", body: { email: "amina@example.com" },
  });
});

test("shows the same recovery success state for an unknown email", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Work email").fill("unknown@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account matches that email, a reset link is on its way.");
  await expect(page.locator("body")).not.toContainText("User not found");
  expect(requests.find((request) => request.path === "/auth/forgot-password")?.body).toEqual({ email: "unknown@example.com" });
});

test("keeps recovery infrastructure failures generic", async ({ page }) => {
  forgotPasswordStatus = 500;
  await page.goto("/forgot-password");
  await page.getByLabel("Work email").fill("amina@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.locator("p[role='alert']")).toContainText("We couldn't send a reset link. Please try again later.");
  await expect(page.locator("body")).not.toContainText("temporarily unavailable");
});

test("uses the emailed reset link parameters and returns to Login after a successful reset", async ({ page }) => {
  const token = "a".repeat(64);
  const userId = "550e8400-e29b-41d4-a716-446655440000";
  await page.goto(`/auth/reset-password?userId=${userId}#token=${token}`);
  await page.getByLabel("New password", { exact: true }).fill("NewPassw0rd");
  await page.getByLabel("Confirm new password").fill("NewPassw0rd");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page).toHaveURL(/\/login\?password=reset$/);
  await expect(page.getByRole("status").filter({ hasText: "Your password has been updated." })).toContainText("Your password has been updated. Sign in with your new password.");
  expect(requests.find((request) => request.path === "/auth/reset-password")).toMatchObject({
    method: "POST", body: { id: userId, token, newPassword: "NewPassw0rd" },
  });
});

test("does not accept a legacy query-string reset token", async ({ page }) => {
  const token = "a".repeat(64);
  const userId = "550e8400-e29b-41d4-a716-446655440000";
  await page.goto(`/auth/reset-password?token=${token}&userId=${userId}`);
  await expect(page.locator("p[role='alert']")).toContainText("This reset link is invalid or expired.");
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
  expect(requests.some((request) => request.path === "/auth/reset-password")).toBe(false);
});
