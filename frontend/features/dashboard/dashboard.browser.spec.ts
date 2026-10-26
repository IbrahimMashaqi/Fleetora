import { expect, test, type Locator, type Page } from "@playwright/test";
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

async function expectWorkspaceEdges(page: Page, locale: "en" | "ar", desktop: boolean) {
  const geometry = await page.getByRole("main").evaluate(element => {
    const rect = (node: Element) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, width: box.width };
    };
    const header = document.querySelector("header"), sidebar = document.querySelector("aside");
    if (!header || !sidebar) throw new Error("Missing dashboard shell landmarks");
    return {
      viewport: document.documentElement.clientWidth,
      root: rect(document.documentElement),
      body: rect(document.body),
      main: rect(element),
      header: rect(header),
      sidebar: rect(sidebar),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(geometry.root.left).toBeCloseTo(0, 0);
  expect(geometry.root.right).toBeCloseTo(geometry.viewport, 0);
  expect(geometry.body.left).toBeCloseTo(0, 0);
  expect(geometry.body.right).toBeCloseTo(geometry.viewport, 0);
  expect(geometry.header.left).toBeCloseTo(geometry.main.left, 0);
  expect(geometry.header.right).toBeCloseTo(geometry.main.right, 0);
  expect(geometry.main.width + (desktop ? geometry.sidebar.width : 0)).toBeCloseTo(geometry.viewport, 0);
  if (desktop) {
    expect(locale === "en" ? geometry.sidebar.left : geometry.sidebar.right).toBeCloseTo(locale === "en" ? 0 : geometry.viewport, 0);
    expect(locale === "en" ? geometry.main.left : geometry.main.right).toBeCloseTo(locale === "en" ? geometry.sidebar.right : geometry.sidebar.left, 0);
  }
  expect(locale === "en" ? geometry.main.right : geometry.main.left).toBeCloseTo(locale === "en" ? geometry.viewport : 0, 0);
  expect(geometry.overflow).toBe(false);
  return geometry;
}

async function expandNavigationGroups(nav: Locator) {
  for (const group of await nav.getByRole("button", { expanded: false }).all()) await group.click();
}

for (const locale of ["en", "ar"] as const) for (const width of [1920, 1440, 1280, 1024, 768, 390]) {
  test(`workspace uses available width and compact spacing in ${locale} at ${width}px`, async ({ page, context }, testInfo) => {
    await context.addCookies([{ name: "fleetora_locale", value: locale, url: "http://localhost:3100" }]);
    await page.route("**/api/auth/session", route => route.fulfill({ json: { user: companyUser } }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app");
    const section = page.getByRole("region", { name: translate(locale, "Live Tracking"), exact: true });
    await expect(section).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: translate(locale, "Overview"), exact: true })).toBeVisible();
    const shellGeometry = await expectWorkspaceEdges(page, locale, width >= 1024);
    await testInfo.attach("shell-geometry", { body: JSON.stringify(shellGeometry, null, 2), contentType: "application/json" });
    await expect(page.getByRole("heading", { name: translate(locale, "Your fleet, in one place"), exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByText(translate(locale, "Driver status reflects the latest actual location sharing."), { exact: true })).toHaveCount(0);
    const geometry = await section.evaluate(element => {
      const box = element.getBoundingClientRect(), main = document.querySelector("main")!, frame = main.getBoundingClientRect(), style = getComputedStyle(main);
      return { left: box.left - frame.left, right: frame.right - box.right, top: box.top - frame.top, padding: parseFloat(style.paddingLeft), paddingTop: parseFloat(style.paddingTop), overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(geometry.left).toBeCloseTo(geometry.padding, 0);
    expect(geometry.right).toBeCloseTo(geometry.padding, 0);
    expect(geometry.top).toBe(geometry.paddingTop);
    expect(geometry.paddingTop).toBe(24);
    expect(geometry.overflow).toBe(false);
    if (width < 1024) await page.getByRole("button", { name: translate(locale, "Open navigation"), exact: true }).click();
    const sidebar = width < 1024 ? page.getByRole("dialog") : page.getByRole("complementary");
    const nav = sidebar.getByRole("navigation");
    await expandNavigationGroups(nav);
    const labels = await sidebar.locator("a > span").evaluateAll(elements => elements.map(element => ({ height: element.getBoundingClientRect().height, line: parseFloat(getComputedStyle(element).lineHeight), overflow: element.scrollWidth > element.clientWidth })));
    expect(labels.length).toBe(14);
    expect(labels.every(label => label.height <= label.line + 1 && !label.overflow)).toBe(true);
    await expect(sidebar.getByRole("link", { name: translate(locale, "Account & security"), exact: true })).toBeInViewport();
    await expect(sidebar.getByRole("button", { name: translate(locale, "Log out"), exact: true })).toBeInViewport();
    await expectWorkspaceEdges(page, locale, width >= 1024);
    await page.screenshot({ path: testInfo.outputPath(`stabilized-${locale}-${width}.png`) });
    if (width < 1024) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).not.toBeVisible(); }
  });
}

test("dashboard follows viewport and language changes without leaving unused space", async ({ page }, testInfo) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { user: companyUser } }));
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1, name: "Overview", exact: true })).toBeVisible();
  const measurements = [];
  for (const locale of ["en", "ar"] as const) {
    if (locale === "ar") {
      await page.getByRole("banner").getByRole("button", { name: "Language", exact: true }).click();
      await page.getByRole("menuitemradio", { name: "Switch language to Arabic", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
    for (const width of [1920, 1440, 1280, 1024, 768, 390, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      measurements.push({ locale, width, ...await expectWorkspaceEdges(page, locale, width >= 1024) });
    }
  }
  await testInfo.attach("shell-resize-geometry", { body: JSON.stringify(measurements, null, 2), contentType: "application/json" });
});

for (const locale of ["en", "ar"] as const) for (const mobile of [false, true]) {
  test(`sidebar keeps account controls fixed while navigation scrolls in ${locale} on ${mobile ? "mobile" : "desktop"}`, async ({ page, context }) => {
    const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
    await context.addCookies([{ name: "fleetora_locale", value: locale, url: "http://localhost:3100" }]);
    await page.route("**/api/auth/session", route => route.fulfill({ json: { user: companyUser } }));
    await page.setViewportSize({ width: mobile ? 390 : 1280, height: 600 });
    await page.goto("/app");
    if (mobile) await page.getByRole("button", { name: t("Open navigation"), exact: true }).click();
    const sidebar = mobile ? page.getByRole("dialog") : page.getByRole("complementary");
    const nav = sidebar.getByRole("navigation", { name: t("Primary navigation"), exact: true });
    await expandNavigationGroups(nav);
    const account = sidebar.getByRole("link", { name: t("Account & security"), exact: true });
    const logout = sidebar.getByRole("button", { name: t("Log out"), exact: true });
    const brand = sidebar.getByText("Fleetora", { exact: true });
    await expect(account).toBeInViewport({ ratio: 1 });
    await expect(logout).toBeInViewport({ ratio: 1 });
    await expect(nav.getByRole("link", { name: t("Account & security"), exact: true })).toHaveCount(0);
    await expect(sidebar.getByText(companyUser.name, { exact: true })).toBeInViewport({ ratio: 1 });
    await expect(sidebar.getByText(t("Company administrator"), { exact: true })).toBeInViewport({ ratio: 1 });
    const before = { brand: await brand.boundingBox(), account: await account.boundingBox(), logout: await logout.boundingBox() };
    const navBox = await nav.boundingBox();
    if (!navBox) throw new Error("Sidebar navigation is not laid out");
    expect(await nav.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    const pageScroll = await page.evaluate(() => scrollY);
    await page.mouse.move(navBox.x + navBox.width / 2, navBox.y + navBox.height / 2);
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => nav.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
    expect(await brand.boundingBox()).toEqual(before.brand);
    expect(await account.boundingBox()).toEqual(before.account);
    expect(await logout.boundingBox()).toEqual(before.logout);
    await account.focus();
    await expect(account).toBeFocused();
    await expect(account).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Tab");
    await expect(logout).toBeFocused();
    await expect(logout).toBeInViewport({ ratio: 1 });
  });

  test(`navigation groups preserve manual intent and reveal the active route in ${locale} on ${mobile ? "mobile" : "desktop"}`, async ({ page, context }) => {
    const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
    await context.addCookies([{ name: "fleetora_locale", value: locale, url: "http://localhost:3100" }]);
    await page.route("**/api/auth/session", route => route.fulfill({ json: { user: companyUser } }));
    await page.setViewportSize({ width: mobile ? 390 : 1440, height: 900 });
    await page.goto("/app");
    const openMobile = async () => { if (mobile) await page.getByRole("button", { name: t("Open navigation"), exact: true }).click(); };
    await openMobile();
    const sidebar = mobile ? page.getByRole("dialog") : page.getByRole("complementary");
    const nav = sidebar.getByRole("navigation", { name: t("Primary navigation"), exact: true });
    const workspace = nav.getByRole("button", { name: t("Workspace"), exact: true });
    const resources = nav.getByRole("button", { name: t("Company resources"), exact: true });
    const parcels = nav.getByRole("button", { name: t("Parcel operations"), exact: true });
    await expect(workspace).toHaveAttribute("aria-expanded", "true");
    await expect(nav.getByRole("link", { name: t("Overview"), exact: true })).toBeVisible();
    if (await resources.getAttribute("aria-expanded") === "true") await resources.click();
    await resources.focus();
    await page.keyboard.press("Enter");
    await expect(resources).toHaveAttribute("aria-expanded", "true");
    await expect(nav.getByRole("link", { name: t("Drivers"), exact: true })).toBeVisible();
    await page.keyboard.press("Space");
    await expect(resources).toHaveAttribute("aria-expanded", "false");
    await expect(nav.getByRole("link", { name: t("Drivers"), exact: true })).not.toBeVisible();
    // Locale changes rerender the shared shell without changing the route.
    if (mobile) await page.keyboard.press("Escape");
    const other = locale === "en" ? "ar" : "en";
    await page.getByRole("banner").getByRole("button", { name: t("Language"), exact: true }).click();
    await page.getByRole("menuitemradio", { name: t(other === "ar" ? "Switch language to Arabic" : "Switch language to English"), exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", other);
    if (mobile) await page.getByRole("button", { name: translate(other, "Open navigation"), exact: true }).click();
    const translatedNav = sidebar.getByRole("navigation", { name: translate(other, "Primary navigation"), exact: true });
    await expect(translatedNav.getByRole("button", { name: translate(other, "Company resources"), exact: true })).toHaveAttribute("aria-expanded", "false");
    if (mobile) await page.keyboard.press("Escape");
    await page.getByRole("banner").getByRole("button", { name: translate(other, "Language"), exact: true }).click();
    await page.getByRole("menuitemradio", { name: translate(other, locale === "ar" ? "Switch language to Arabic" : "Switch language to English"), exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await openMobile();
    await expect(resources).toHaveAttribute("aria-expanded", "false");
    await expect(workspace).toHaveAttribute("aria-expanded", "true");
    if (await parcels.getAttribute("aria-expanded") === "false") await parcels.click();
    await expect(parcels).toHaveAttribute("aria-expanded", "true");
    const operations = nav.locator("a[href='/app/operations']");
    await expect(operations).toBeVisible();
    expect((await operations.innerText()).trim()).not.toBe(t("Parcel operations"));
    await operations.click();
    await expect(page).toHaveURL(/\/app\/operations$/);
    await openMobile();
    await expect(operations).toHaveAttribute("aria-current", "page");
    await expect(operations).toBeInViewport({ ratio: 1 });
    await expect(parcels).toHaveAttribute("aria-expanded", "true");
    await expect(resources).toHaveAttribute("aria-expanded", "false");
    // A user may collapse the active group, but browser navigation must reveal
    // the destination's group again, including a group collapsed on that route.
    await parcels.click();
    await expect(parcels).toHaveAttribute("aria-expanded", "false");
    await page.setViewportSize({ width: mobile ? 390 : 1440, height: 600 });
    await resources.click();
    await expect(resources).toHaveAttribute("aria-expanded", "true");
    await nav.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => nav.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    if (mobile) await page.keyboard.press("Escape");
    await page.goBack();
    await expect(page).toHaveURL(/\/app$/);
    await openMobile();
    await expect(workspace).toHaveAttribute("aria-expanded", "true");
    const overview = nav.getByRole("link", { name: t("Overview"), exact: true });
    await expect(overview).toHaveAttribute("aria-current", "page");
    await expect(overview).toBeInViewport({ ratio: 1 });
    if (mobile) await page.keyboard.press("Escape");
    await page.goForward();
    await expect(page).toHaveURL(/\/app\/operations$/);
    await openMobile();
    await expect(parcels).toHaveAttribute("aria-expanded", "true");
    await expect(operations).toBeInViewport({ ratio: 1 });
    await expect(operations).toHaveAttribute("aria-current", "page");
  });

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
    await expect(trigger).toHaveAttribute("title", t("Language"));
    await expect(trigger).toHaveCSS("cursor", "pointer");
    const idleBackground = await trigger.evaluate(element => getComputedStyle(element).backgroundColor);
    await trigger.hover();
    await expect.poll(() => trigger.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(idleBackground);
    await expect(header.getByRole("tooltip", { name: t("Change language"), exact: true })).toBeVisible();
    const triggerBox = await trigger.boundingBox();
    if (!triggerBox) throw new Error("Language control is not laid out");
    expect(triggerBox.width).toBeGreaterThanOrEqual(40);
    expect(triggerBox.height).toBeGreaterThanOrEqual(40);
    await trigger.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(trigger).toBeFocused();
    const focus = await trigger.evaluate(element => {
      const style = getComputedStyle(element);
      return element.matches(":focus-visible") && (style.boxShadow !== "none" || parseFloat(style.outlineWidth) > 0);
    });
    expect(focus).toBe(true);
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
    await expect(active).toHaveCSS("outline-style", "none");
    await expect(active).toHaveCSS("box-shadow", "none");
    expect(await renderedContrast(active)).toBeGreaterThanOrEqual(4.5);
    const accent = await active.evaluate(e => { const s = getComputedStyle(e, "::before"); return { width: s.width, left: s.left, right: s.right }; });
    expect(accent.width).toBe("2px"); expect(other === "en" ? accent.left : accent.right).toBe("0px");
    await active.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(active).toBeFocused();
    await expect(active).toHaveCSS("outline-width", "2px");
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

test("mobile navigation closes from its backdrop and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/auth/session", route => route.fulfill({ json: { user: companyUser } }));
  await page.goto("/app");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Open navigation" });
  await expect(dialog).toBeVisible();
  await page.mouse.click(380, 300);
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

for (const locale of ["en", "ar"] as const) {
  test(`language tooltip can be hovered and dismissed without moving focus in ${locale}`, async ({ page, context }) => {
    const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
    await context.addCookies([{ name: "fleetora_locale", value: locale, url: "http://localhost:3100" }]);
    await page.route("**/api/auth/session", route => route.fulfill({ json: { user: companyUser } }));
    await page.goto("/app");
    const trigger = page.getByRole("banner").getByRole("button", { name: t("Language"), exact: true });
    const tooltip = page.getByRole("tooltip", { name: t("Change language"), exact: true });
    const content = page.getByRole("main");
    // The session-loading view also has a main landmark; wait for the workspace.
    await expect(trigger).toBeVisible();
    await content.focus();
    await expect(content).toBeFocused();
    await trigger.hover();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooltip).not.toBeVisible();
    await expect(content).toBeFocused();
    await page.mouse.move(0, 0);
    await trigger.hover();
    await expect(tooltip).toBeVisible();
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
    await trigger.focus();
    await page.keyboard.press("Escape");
    await expect(tooltip).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(page.getByRole("menu", { name: t("Language"), exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(tooltip).not.toBeVisible();
    await page.keyboard.press("Tab");
    await expect(trigger).not.toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(trigger).toBeFocused();
    await expect(tooltip).toBeVisible();
  });
}

for (const role of ["ACCOUNTANT", "MERCHANT"] as const) {
  test(`overview shortcuts respect ${role} navigation access`, async ({ page }) => {
    await page.route("**/api/auth/session", route => route.fulfill({ json: { user: { ...companyUser, role } } }));
    await page.goto("/app");
    const content = page.getByRole("main");
    await expect(content.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
    await expect(content.getByRole("link").first()).toBeVisible();
    const destinations = await content.locator("a[href]").evaluateAll(links => links.map(link => link.getAttribute("href")));
    const allowed = role === "ACCOUNTANT"
      ? ["/app/operations", "/app/collections", "/app/settlements"]
      : ["/app/account"];
    expect(destinations).toEqual(allowed);
    await expect(content.getByRole("region", { name: "Live Tracking", exact: true })).toHaveCount(0);
  });
}
