import { expect, test } from "@playwright/test";

const companyUser = {
  id: "user-1",
  name: "Amina Hassan",
  email: "amina@example.com",
  role: "COMPANY_ADMIN",
  orgId: "company-1",
  company: { id: "company-1", name: "Amina Logistics" },
};

const platformAdmin = {
  id: "admin-1",
  name: "Fleetora Administrator",
  email: null,
  role: "PLATFORM_ADMIN",
  orgId: null,
  company: null,
};

function contrastRatio(foreground: string, background: string) {
  const luminance = (color: string) => {
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
    const linear = channels.map((channel) => {
      const value = channel > 1 ? channel / 255 : channel;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("shows validated company identity and only implemented navigation", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: companyUser }),
  }));

  await page.goto("/app");

  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
  await expect(page.getByText("Amina Logistics", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("amina@example.com").first()).toBeVisible();
  await expect(page.getByText("Your company workspace is active.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(page.getByText(/shipments today|drivers active|delivery rate/i)).toHaveCount(0);
  await expect(page.getByText(/operational information will appear here/i)).toHaveCount(0);
  const destinations = await page.locator("a[href^='/']").evaluateAll((links) =>
    [...new Set(links.map((link) => link.getAttribute("href")))],
  );
  expect(destinations).toEqual(["/app", "/app/account", "/app/merchants", "/app/drivers"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const browserStorage = await page.evaluate(() => JSON.stringify({
    cookies: document.cookie,
    local: window.localStorage,
    session: window.sessionStorage,
  }));
  expect(browserStorage).not.toMatch(/fleetora_(access|refresh)|accessToken|refreshToken/);
});

test("shows a company-free platform administrator workspace", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: platformAdmin }),
  }));

  await page.goto("/app");

  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
  await expect(page.getByText("Platform administrator", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/workspace.*associated with a company/i)).toBeVisible();
  await expect(page.getByText("Amina Logistics")).toHaveCount(0);
});

test("keeps protected content hidden until session bootstrap completes", async ({ page }) => {
  let releaseSession!: () => void;
  const pendingSession = new Promise<void>((resolve) => { releaseSession = resolve; });
  await page.route("**/api/auth/session", async (route) => {
    await pendingSession;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: companyUser }),
    });
  });

  await page.goto("/app");
  await expect(page.getByRole("status")).toContainText("Checking your session");
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Workspace sidebar" })).toHaveCount(0);
  await expect(page.getByText("Amina Hassan")).toHaveCount(0);

  releaseSession();
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Workspace sidebar" })).toBeVisible();
});

test("rejects malformed session identity without rendering protected content", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: { ...companyUser, orgId: "another-company" } }),
  }));

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "We couldn’t verify your session" })).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toHaveCount(0);
  await expect(page.getByText("Amina Hassan")).toHaveCount(0);
});

test("shows a safe failure state when session bootstrap cannot reach the service", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.abort("failed"));

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "We couldn’t verify your session" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toHaveCount(0);
  await expect(page.getByText("Amina Hassan")).toHaveCount(0);
});

test("redirects an expired session to Login without rendering identity", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ message: "Please sign in again." }),
  }));

  await page.goto("/app");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Amina Hassan")).toHaveCount(0);
});

test("shows a safe retry state for session service failures", async ({ page }) => {
  let allowRecovery = false;
  await page.route("**/api/auth/session", (route) => {
    // Keep the initial state failed through React Strict Mode's duplicate dev effect.
    return route.fulfill(allowRecovery
      ? {
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ user: companyUser }),
        }
      : {
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Upstream authorization failure with private infrastructure details." }),
        });
  });

  await page.goto("/app");

  await expect(page.getByRole("heading", { name: "We couldn’t verify your session" })).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator("body")).not.toContainText("private infrastructure details");
  await expect(page.getByText("Amina Hassan")).toHaveCount(0);
  const retryColors = await page.getByRole("button", { name: "Try again" }).evaluate((button) => {
    const style = getComputedStyle(button);
    return { foreground: style.color, background: style.backgroundColor };
  });
  expect(contrastRatio(retryColors.foreground, retryColors.background)).toBeGreaterThanOrEqual(4.5);
  allowRecovery = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
});

test("offers a retry when another request has rotated the session", async ({ page }) => {
  let allowRecovery = false;
  await page.route("**/api/auth/session", (route) => {
    // Keep the conflict visible until the user chooses to retry.
    return route.fulfill(allowRecovery
      ? { status: 200, contentType: "application/json", body: JSON.stringify({ user: companyUser }) }
      : { status: 409, contentType: "application/json", body: JSON.stringify({ message: "Session changed." }) });
  });

  await page.goto("/app");

  await expect(page.getByText("Your session changed while it was being checked. Please try again.")).toBeVisible();
  allowRecovery = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
});

test("adapts at supported viewport widths and keeps long identities from overflowing", async ({ page }) => {
  const longCompanyUser = {
    ...companyUser,
    name: "Amina Hassan with a deliberately long display name",
    company: {
      id: "company-1",
      name: "Amina Logistics and Regional Distribution Company",
    },
  };
  await page.route("**/api/auth/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: longCompanyUser }),
  }));

  for (const viewport of [
    { width: 320, height: 900 },
    { width: 375, height: 900 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
    { width: 1024, height: 568 },
    { width: 1440, height: 900 },
  ]) {
    const { width, height } = viewport;
    await page.setViewportSize({ width, height });
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    if (width >= 768) {
      await expect(page.locator("header").getByTitle(longCompanyUser.company.name)).toBeVisible();
    }

    if (width < 1024) {
      await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    } else {
      await expect(page.getByRole("complementary", { name: "Workspace sidebar" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    }
  }
});

test("mobile navigation is modal, keyboard accessible, and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/auth/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: companyUser }),
  }));

  await page.goto("/app");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Mobile navigation" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  await expect(page.getByRole("button", { name: "Close navigation" })).toBeFocused();
  await expect(dialog.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(dialog.getByText("Amina Logistics", { exact: true })).toBeVisible();
  await expect(dialog.getByText("amina@example.com")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Log out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
