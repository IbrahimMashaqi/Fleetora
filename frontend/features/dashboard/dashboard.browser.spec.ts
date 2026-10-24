import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { translate } from "@/lib/i18n";
import { contrastRatio as renderedContrast } from "@/tests/ui-assertions";

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
let backend: Server;
test.beforeAll(async () => {
  backend = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/auth/session") response.end(JSON.stringify({ success: true, data: companyUser }));
    else response.writeHead(503).end(JSON.stringify({ success: false }));
  });
  await new Promise<void>((resolve, reject) => { backend.once("error", reject); backend.listen(3101, "127.0.0.1", resolve); });
});
test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: "fleetora_access", value: "dashboard-session-fixture", url: "http://localhost:3100", httpOnly: true }]);
  await page.route("https://tiles.openfreemap.org/**", route => route.abort());
});
test.afterAll(async () => { backend.closeAllConnections(); await new Promise<void>(resolve => backend.close(() => resolve())); });

for (const locale of ["en", "ar"] as const) for (const width of [1920, 1440, 1024, 768, 390]) {
  test(`workspace uses available width and compact spacing in ${locale} at ${width}px`, async ({ page, context }, testInfo) => {
    await context.addCookies([{ name: "fleetora_locale", value: locale, url: "http://localhost:3100" }]);
    await page.route("**/api/auth/session", route => route.fulfill({ json: { user: companyUser } }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app");
    const section = page.getByRole("region", { name: translate(locale, "Live Tracking"), exact: true });
    await expect(section).toBeVisible();
    const geometry = await section.evaluate(element => {
      const box = element.getBoundingClientRect(), main = document.querySelector("main")!, frame = main.getBoundingClientRect(), style = getComputedStyle(main);
      return { left: box.left - frame.left, right: frame.right - box.right, top: box.top - frame.top, padding: parseFloat(style.paddingLeft), overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(geometry.left).toBeCloseTo(geometry.padding, 0);
    expect(geometry.right).toBeCloseTo(geometry.padding, 0);
    expect(geometry.top).toBeLessThanOrEqual(24);
    expect(geometry.overflow).toBe(false);
    if (width < 1024) await page.getByRole("button", { name: translate(locale, "Open navigation"), exact: true }).click();
    const nav = width < 1024 ? page.getByRole("dialog").getByRole("navigation") : page.getByRole("complementary").getByRole("navigation");
    const labels = await nav.locator("a > span").evaluateAll(elements => elements.map(element => ({ height: element.getBoundingClientRect().height, line: parseFloat(getComputedStyle(element).lineHeight), overflow: element.scrollWidth > element.clientWidth })));
    expect(labels.length).toBe(14);
    expect(labels.every(label => label.height <= label.line + 1 && !label.overflow)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`stabilized-${locale}-${width}.png`) });
    if (width < 1024) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).not.toBeVisible(); }
  });
}

for (const locale of ["en", "ar"] as const) for (const mobile of [false, true]) {
  test(`shared header, language menu and sidebar in ${locale} on ${mobile ? "mobile" : "desktop"}`, async ({ page, context }, testInfo) => {
    const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
    const other = locale === "en" ? "ar" : "en";
    const longUser = { ...companyUser, company: { ...companyUser.company, name: "Fictional Logistics and Regional Distribution Company with a long name" } };
    await page.route("**/api/auth/session", route => route.fulfill({ json: { user: longUser } }));
    await context.addCookies([{ name: "fleetora_locale", value: locale, url: "http://localhost:3100" }]);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await page.goto("/app?view=workspace#overview");
    const header = page.getByRole("banner");
    const title = header.getByRole("heading", { name: t("Overview"), exact: true });
    await expect(title).toBeVisible();
    await expect(header).toHaveCSS("height", "64px");
    await expect(header.getByText(t("Company"), { exact: true })).toHaveCount(0);
    const company = header.getByTitle(longUser.company.name);
    await expect(company).toBeVisible();
    const bounds = await title.boundingBox(), content = await page.locator("main > div").first().boundingBox(), companyBounds = await company.boundingBox();
    if (!bounds || !content || !companyBounds) throw new Error("Missing workspace geometry");
    expect(Math.abs(locale === "en" ? bounds.x - content.x : bounds.x + bounds.width - content.x - content.width)).toBeLessThan(2);
    expect(locale === "en" ? companyBounds.x > bounds.x : companyBounds.x < bounds.x).toBe(true);
    expect(await title.evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThan(await company.evaluate(e => parseFloat(getComputedStyle(e).fontSize)));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const trigger = header.getByRole("button", { name: t("Language"), exact: true });
    expect(await renderedContrast(trigger)).toBeGreaterThanOrEqual(4.5);
    await trigger.focus(); await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: t("Language"), exact: true });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitemradio").first()).toBeFocused();
    const selected = page.getByRole("menuitemradio", { name: t(locale === "en" ? "Switch language to English" : "Switch language to Arabic") });
    await expect(selected).toHaveAttribute("aria-checked", "true");
    expect(await renderedContrast(selected)).toBeGreaterThanOrEqual(4.5);
    const menuBounds = await menu.boundingBox();
    if (!menuBounds) throw new Error("Menu not laid out");
    expect(menuBounds.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(mobile ? 390 : 1440);
    await page.screenshot({ path: testInfo.outputPath(`header-menu-${locale}-${mobile ? "mobile" : "desktop"}.png`) });
    await page.keyboard.press(locale === "en" ? "End" : "Home");
    // Radix roving focus schedules keyboard navigation. Wait for the target
    // item to receive focus before sending Enter, rather than selecting the old one.
    await expect(menu.getByRole("menuitemradio", { name: t(other === "ar" ? "Switch language to Arabic" : "Switch language to English") })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", other);
    await expect(page).toHaveURL(/\/app\?view=workspace#overview$/);
    await expect(header.getByTitle(longUser.company.name)).toBeVisible();
    expect((await context.cookies()).find(cookie => cookie.name === "fleetora_locale")?.value).toBe(other);
    const otherTrigger = header.getByRole("button", { name: translate(other, "Language"), exact: true });
    await otherTrigger.click(); await page.keyboard.press("Escape"); await expect(otherTrigger).toBeFocused();

    if (mobile) await page.getByRole("button", { name: translate(other, "Open navigation") }).click();
    const sidebar = mobile ? page.getByRole("dialog", { name: translate(other, "Open navigation") }) : page.getByRole("complementary", { name: "Workspace sidebar" });
    await expect(sidebar.getByText(companyUser.name, { exact: true })).toBeVisible();
    await expect(sidebar.getByText(companyUser.email, { exact: true })).toHaveCount(0);
    await expect(sidebar.getByText(translate(other, "Signed in as"), { exact: true })).toHaveCount(0);
    const active = sidebar.getByRole("link", { name: translate(other, "Overview"), exact: true });
    await expect(active).toHaveAttribute("aria-current", "page");
    await expect(active).toHaveCSS("border-inline-start-width", "0px");
    const accent = await active.evaluate(e => { const s = getComputedStyle(e, "::before"); return { width: s.width, left: s.left, right: s.right }; });
    expect(accent.width).toBe("2px"); expect(other === "en" ? accent.left : accent.right).toBe("0px");
    const logout = sidebar.getByRole("button", { name: translate(other, "Log out"), exact: true });
    await expect(logout).toHaveCSS("min-height", "44px"); await expect(logout.locator("svg")).toHaveCSS("width", "20px");
    await expect(logout).toHaveCSS("padding-inline-start", "12px");
    if (mobile) { await page.keyboard.press("Escape"); await expect(sidebar).not.toBeVisible(); }
    await page.screenshot({ path: testInfo.outputPath(`workspace-${other}-${mobile ? "mobile" : "desktop"}.png`) });
  });
}

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

  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByText("Amina Logistics", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("amina@example.com", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Workspace sidebar" }).getByText("Company administrator", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(page.getByText(/shipments today|drivers active|delivery rate/i)).toHaveCount(0);
  await expect(page.getByText(/operational information will appear here/i)).toHaveCount(0);
  const destinations = await page.locator("a[href^='/']").evaluateAll((links) =>
    [...new Set(links.map((link) => link.getAttribute("href")))],
  );
  expect(destinations).toEqual(["/app", "/app/live-map", "/app/operations", "/app/parcels", "/app/pickups", "/app/requests", "/app/pricing", "/app/merchants", "/app/drivers", "/app/vehicles", "/app/returns", "/app/collections", "/app/settlements", "/app/account"]);
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

  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByText("Platform administrator", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("You are signed in with platform-level access and no company workspace.", { exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Workspace sidebar" })).toHaveCount(0);
  await expect(page.getByText("Amina Hassan")).toHaveCount(0);

  releaseSession();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toHaveCount(0);
  await expect(page.getByText("Amina Hassan")).toHaveCount(0);
});

test("shows a safe failure state when session bootstrap cannot reach the service", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.abort("failed"));

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "We couldn’t verify your session" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toHaveCount(0);
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
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
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

  const dialog = page.getByRole("dialog", { name: "Open navigation" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  await expect(page.getByRole("button", { name: "Close navigation" })).toBeFocused();
  await expect(dialog.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(dialog.getByText("Amina Logistics", { exact: true })).toBeVisible();
  await expect(dialog.getByText("amina@example.com", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Log out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
