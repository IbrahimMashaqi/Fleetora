import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import type { FleetDriver, Headquarters } from "./fleet.types";
import { translate } from "@/lib/i18n";

const user = { id: "fleet-admin", name: "مسؤول الشركة", email: null, role: "COMPANY_ADMIN", orgId: "fleet-company", company: { id: "fleet-company", name: "شركة الأسطول" } };
const driver = (id: string, name: string): FleetDriver => ({ id, name, phone: "+970599123456", vehicle: { id: `vehicle-${id}`, type: "VAN", manufacturer: "Ford", model: "Transit", plateNumber: `P-${id}` }, tracking: { revision: 0, sharing: false, sharingStartedAt: null, location: null } });
let server: Server;
let headquarters: Headquarters | null;
let drivers: FleetDriver[];
let saves: number;
let denied: boolean;
let failTiles: boolean;
let snapshotStatus: number;
let pendingSnapshot: Promise<void> | undefined;
let snapshotRequests: number;
let activeLocationDriverId: string | null;
let publicMapResources: { path: string; status: number }[];
const mapLoadTimeout = process.env.FLEETORA_VERIFY_PUBLIC_MAP_TILES === "1" ? 30_000 : 5_000;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    const respond = (data: unknown) => response.end(JSON.stringify({ success: true, data }));
    if (request.url === "/auth/session") return respond(user);
    if (request.url === "/fleet/socket-ticket") { response.writeHead(503).end(JSON.stringify({ message: "fixture transport unavailable" })); return; }
    if (request.url === "/fleet/locations") {
      snapshotRequests += 1;
      if (pendingSnapshot) await pendingSnapshot;
      if (snapshotStatus !== 200) { response.writeHead(snapshotStatus).end(JSON.stringify({ success: false })); return; }
      if (denied) { response.writeHead(403).end(); return; }
      const serverTime = new Date().toISOString();
      const activeDriver = drivers.find(item => item.id === activeLocationDriverId);
      if (activeDriver?.tracking.location) {
        // Only the mixed-state fixture simulates a new active sample per snapshot.
        activeDriver.tracking.location = { ...activeDriver.tracking.location, capturedAt: serverTime, receivedAt: serverTime };
      }
      return respond({ companyId: user.orgId, serverTime, freshnessSeconds: 45, headquarters, drivers });
    }
    if (request.url === "/companies/me/headquarters" && request.method === "PATCH") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const input = JSON.parse(Buffer.concat(chunks).toString());
      expect(input).not.toHaveProperty("companyId");
      expect(input.expectedRevision).toBe(headquarters?.revision ?? 0);
      headquarters = { latitude: input.latitude, longitude: input.longitude, address: input.address, revision: (headquarters?.revision ?? 0) + 1, updatedAt: new Date().toISOString() };
      saves += 1;
      return respond({ companyId: user.orgId, headquarters });
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(3101, "127.0.0.1", resolve); });
});
test.beforeEach(async ({ context, page }) => {
  headquarters = null; drivers = [driver("1", "أحمد حسن"), driver("2", "سارة علي")]; saves = 0; denied = false; failTiles = false;
  snapshotStatus = 200; pendingSnapshot = undefined; snapshotRequests = 0; activeLocationDriverId = null;
  await context.addCookies([{ name: "fleetora_access", value: "fleet-ui-fixture", url: "http://localhost:3100", httpOnly: true }]);
  await context.addCookies([{ name: "fleetora_locale", value: "ar", url: "http://localhost:3100" }]);
  publicMapResources = [];
  page.on("response", response => {
    const url = new URL(response.url());
    if (url.hostname === "tiles.openfreemap.org") publicMapResources.push({ path: url.pathname, status: response.status() });
  });
  // Normal runs stay offline. Opt-in provider QA uses real public tiles with the same isolated company API.
  await page.route("https://tiles.openfreemap.org/**", route => {
    if (failTiles) return route.abort();
    if (process.env.FLEETORA_VERIFY_PUBLIC_MAP_TILES === "1") return route.continue();
    if (new URL(route.request().url()).pathname === "/styles/liberty") return route.fulfill({ json: {
      version: 8,
      sources: { fixture: { type: "raster", tiles: ["https://tiles.openfreemap.org/test-fixture/{z}/{x}/{y}.png"], tileSize: 256, attribution: "OpenFreeMap © OpenMapTiles © OpenStreetMap" } },
      layers: [{ id: "background", type: "background", paint: { "background-color": "#f5f3ee" } }, { id: "fixture", type: "raster", source: "fixture" }],
    } });
    return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADklEQVR4AWJ6/OrDfwAAAAD//6YrGlwAAAAGSURBVAMACTgDv5HhbRIAAAAASUVORK5CYII=", "base64") });
  });
});
test.afterAll(async () => { if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

async function openFleet(page: Page) {
  await page.goto("/app/live-map");
  await expect(page.getByRole("complementary", { name: "قائمة السائقين" })).toBeVisible();
  await expect(page.getByRole("button", { name: /أحمد حسن/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "تكبير الخريطة", exact: true })).toBeVisible();
}

test("the language dropdown updates an already-mounted map without changing route or identity", async ({ page }) => {
  headquarters = { latitude: 31.9, longitude: 35.2, address: "Isolated headquarters", revision: 1, updatedAt: new Date().toISOString() };
  await openFleet(page);
  await expect(page.getByRole("button", { name: "مقر شركة الأسطول", exact: true })).toBeVisible();
  const styleLoads = publicMapResources.filter(resource => resource.path === "/styles/liberty").length;
  await page.getByRole("button", { name: "اللغة", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "التبديل إلى الإنجليزية" }).click();
  await expect(page).toHaveURL(/\/app\/live-map$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("button", { name: "Headquarters for شركة الأسطول", exact: true })).toBeVisible({ timeout: mapLoadTimeout });
  await expect(page.getByRole("button", { name: /أحمد حسن/ })).toBeVisible();
  await expect.poll(() => publicMapResources.filter(resource => resource.path === "/styles/liberty").length).toBeGreaterThan(styleLoads);
  await expect(page.locator(".maplibregl-marker")).toHaveCount(1);
  expect(saves).toBe(0);
});

for (const locale of ["ar", "en"] as const) {
  for (const mobile of [false, true]) {
    test(`light roadmap, headquarters and GPS details in ${locale} on ${mobile ? "mobile" : "desktop"}`, async ({ page, context }, testInfo) => {
      testInfo.setTimeout(90_000);
      await context.addCookies([{ name: "fleetora_locale", value: locale, url: "http://localhost:3100" }]);
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      headquarters = { latitude: 31.9038, longitude: 35.2034, address: "Isolated map QA headquarters", revision: 1, updatedAt: new Date().toISOString() };
      // Fictional GPS belongs to the isolated API fixture only, never to application or Neon data.
      const now = new Date().toISOString();
      drivers[0].tracking = { revision: 1, sharing: true, sharingStartedAt: now, location: { latitude: 31.9042, longitude: 35.204, capturedAt: now, receivedAt: now, accuracy: 5, heading: 90, speed: 0 } };
      const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
      await page.goto("/app/live-map");
      const marker = page.getByRole("button", { name: translate(locale, "Headquarters for {company}", { company: user.company.name }), exact: true });
      await expect(marker).toBeVisible({ timeout: mapLoadTimeout });
      await expect(page.locator(".maplibregl-marker")).toHaveCount(1);
      await expect(page.getByText(t("Loading map..."), { exact: true })).toHaveCount(0);
      await expect(page.getByText(t("Map is unavailable right now"), { exact: true })).toHaveCount(0);
      await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("OpenStreetMap");
      // Map controls and cartography remain light even under a dark application shell.
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      const zoom = page.getByRole("button", { name: t("Zoom in"), exact: true });
      await expect(zoom).toHaveCSS("width", "44px");
      await expect(zoom.locator("..")).toHaveCSS("background-color", "rgb(255, 255, 255)");
      const panel = page.getByRole("complementary", { name: t("Driver list") });
      const attributionBox = await page.locator(".maplibregl-ctrl-attrib").boundingBox();
      const mapBounds = await page.getByTestId("fleet-map").boundingBox();
      if (!attributionBox || !mapBounds) throw new Error("Missing map attribution geometry");
      expect(attributionBox.x).toBeGreaterThanOrEqual(mapBounds.x + 8);
      expect(attributionBox.x + attributionBox.width).toBeLessThanOrEqual(mapBounds.x + mapBounds.width - 8);
      expect(mapBounds.y + mapBounds.height - attributionBox.y - attributionBox.height).toBeGreaterThanOrEqual(8);
      if (mobile) {
        const panelBounds = await panel.boundingBox();
        if (!panelBounds) throw new Error("Missing mobile driver panel geometry");
        expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(attributionBox.y);
      }
      if (!mobile) {
        await expect(panel).toHaveCSS("width", "320px");
        const panelBox = await panel.boundingBox(), mapBox = await page.getByTestId("fleet-map").boundingBox(), zoomBox = await zoom.boundingBox();
        if (!panelBox || !mapBox || !zoomBox) throw new Error("Missing fleet geometry");
        expect(locale === "en" ? mapBox.x >= panelBox.x + panelBox.width : mapBox.x + mapBox.width <= panelBox.x).toBe(true);
        expect(zoomBox.x >= mapBox.x && zoomBox.x + zoomBox.width <= mapBox.x + mapBox.width).toBe(true);
      }
      await expect(page.getByText(t("Your fleet map starts here"), { exact: true })).toHaveCount(0);
      await expect(page.getByText(t("Your fleet, in one place"), { exact: true })).toHaveCount(0);
      await zoom.focus();
      await expect(zoom).toBeFocused();
      await page.keyboard.press("Enter");
      const canvas = page.getByTestId("fleet-map").locator("canvas");
      await canvas.focus();
      await expect(canvas).toBeFocused();
      const beforePan = await marker.evaluate(element => element.getBoundingClientRect().x);
      await page.keyboard.press("ArrowRight");
      await expect.poll(async () => Math.abs(await marker.evaluate(element => element.getBoundingClientRect().x) - beforePan)).toBeGreaterThan(10);
      const beforeZoom = await marker.evaluate(element => element.getBoundingClientRect().x);
      await page.keyboard.press("Equal");
      await expect.poll(async () => Math.abs(await marker.evaluate(element => element.getBoundingClientRect().x) - beforeZoom)).toBeGreaterThan(10);
      await page.getByRole("button", { name: /أحمد حسن/ }).click();
      await expect(page.getByText("31.90420, 35.20400", { exact: true })).toBeVisible();
      if (process.env.FLEETORA_VERIFY_PUBLIC_MAP_TILES === "1") {
        await expect.poll(() => publicMapResources.some(resource => resource.path.endsWith(".pbf") && !resource.path.startsWith("/fonts/") && resource.status === 200), { timeout: 30_000 }).toBe(true);
        await expect.poll(() => publicMapResources.some(resource => resource.path.startsWith("/fonts/") && resource.status === 200), { timeout: 30_000 }).toBe(true);
        expect(publicMapResources.some(resource => resource.path === "/styles/liberty" && resource.status === 200)).toBe(true);
        expect(publicMapResources.filter(resource => resource.status >= 400)).toEqual([]);
      }
      await page.screenshot({ path: testInfo.outputPath(`roadmap-${locale}-${mobile ? "mobile" : "desktop"}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      expect(saves).toBe(0);
    });
  }
}

for (const locale of ["en", "ar"] as const) {
  test(`tracking state filters exclude drivers without location in ${locale}`, async ({ page, context }) => {
    await context.addCookies([{ name: "fleetora_locale", value: locale, url: "http://localhost:3100" }]);
    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 120_000).toISOString();
    drivers = [driver("1", "أحمد حسن"), driver("2", "سارة علي"), driver("3", "بدون موقع")];
    activeLocationDriverId = "1";
    drivers[0].tracking = { revision: 1, sharing: true, sharingStartedAt: now, location: { latitude: 31.9, longitude: 35.2, capturedAt: now, receivedAt: now, accuracy: 5, heading: null, speed: 0 } };
    drivers[1].tracking = { revision: 1, sharing: true, sharingStartedAt: stale, location: { latitude: 31.91, longitude: 35.21, capturedAt: stale, receivedAt: stale, accuracy: 5, heading: null, speed: 0 } };
    const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
    await page.goto("/app");
    const preview = page.getByRole("region", { name: t("Live Tracking"), exact: true });
    await expect.soft(preview.locator("dd")).toHaveText(Array(3).fill(Number(1).toLocaleString(locale)));
    await preview.getByRole("link", { name: t("Open full map"), exact: true }).click();
    const panel = page.getByRole("complementary", { name: t("Driver list"), exact: true });
    await expect(panel.locator("ul > li > button")).toHaveCount(3);
    await panel.getByRole("button", { name: t("Online"), exact: true }).click();
    await expect(panel.locator("ul > li > button")).toHaveCount(1);
    await expect(panel.getByRole("button", { name: /أحمد حسن/ })).toBeVisible();
    await panel.getByRole("button", { name: t("Offline"), exact: true }).click();
    await expect(panel.locator("ul > li > button")).toHaveCount(1);
    await expect(panel.getByRole("button", { name: /سارة علي/ })).toBeVisible();
    await expect(panel.getByRole("button", { name: /بدون موقع/ })).toHaveCount(0);
    await panel.getByRole("button", { name: t("All"), exact: true }).click();
    await expect(panel.locator("ul > li > button")).toHaveCount(3);
    await expect(panel.getByRole("button", { name: /بدون موقع/ })).toContainText(t("Has not shared a location"));
    expect(saves).toBe(0);
  });

  for (const mobile of [false, true]) {
    test(`overview map overlay stays readable and passes map gestures in ${locale} on ${mobile ? "mobile" : "desktop"}`, async ({ page, context }) => {
      await context.addCookies([{ name: "fleetora_locale", value: locale, url: "http://localhost:3100" }]);
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
      headquarters = { latitude: 31.77, longitude: 35.21, address: "Isolated test headquarters", revision: 1, updatedAt: new Date().toISOString() };
      const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
      await page.goto("/app");
      const preview = page.getByRole("region", { name: t("Live Tracking"), exact: true });
      const note = preview.getByText(t("Driver locations will appear here once location sharing is enabled in the driver app."), { exact: true });
      await expect(note).toBeVisible({ timeout: mapLoadTimeout });
      await note.scrollIntoViewIfNeeded();
      await expect.soft(note).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await expect(note).toHaveCSS("pointer-events", "none");
      expect.soft(await note.evaluate(element => {
        const region = element.closest("section");
        return region !== null && getComputedStyle(element).color === getComputedStyle(region).color;
      })).toBe(true);

      const map = preview.getByTestId("fleet-map");
      const attribution = map.locator(".maplibregl-ctrl-attrib");
      await expect(attribution).toContainText("OpenFreeMap");
      await expect(attribution).toContainText("OpenStreetMap");
      const mapBox = await map.boundingBox(), noteBox = await note.boundingBox(), attributionBox = await attribution.boundingBox();
      if (!mapBox || !noteBox || !attributionBox) throw new Error("Missing overview map geometry");
      expect(noteBox.x).toBeGreaterThanOrEqual(mapBox.x + 8);
      expect(noteBox.x + noteBox.width).toBeLessThanOrEqual(mapBox.x + mapBox.width - 8);
      expect(noteBox.y + noteBox.height).toBeLessThan(attributionBox.y);
      expect.soft(mapBox.y + mapBox.height - attributionBox.y - attributionBox.height).toBeGreaterThanOrEqual(8);
      expect(attributionBox.x).toBeGreaterThanOrEqual(mapBox.x + 8);
      expect(attributionBox.x + attributionBox.width).toBeLessThanOrEqual(mapBox.x + mapBox.width - 8);

      const pointer = { x: noteBox.x + noteBox.width / 2, y: noteBox.y + noteBox.height / 2 };
      expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, pointer)).toBe("CANVAS");
      const marker = preview.locator(".maplibregl-marker");
      const originalX = await marker.evaluate(element => element.getBoundingClientRect().x);
      await page.mouse.move(pointer.x, pointer.y);
      await page.mouse.down();
      await page.mouse.move(pointer.x + 48, pointer.y + 20, { steps: 8 });
      await page.mouse.up();
      await expect.poll(async () => Math.abs(await marker.evaluate(element => element.getBoundingClientRect().x) - originalX)).toBeGreaterThan(10);
      await expect(page).toHaveURL(/\/app$/);
      expect(saves).toBe(0);
    });
  }

  test(`overview no-GPS counts, saved headquarters and forward arrow in ${locale}`, async ({ page, context }, testInfo) => {
    testInfo.setTimeout(90_000);
    await context.addCookies([{ name: "fleetora_locale", value: locale, url: "http://localhost:3100" }]);
    headquarters = { latitude: 31.77, longitude: 35.21, address: "Fictional test headquarters", revision: 1, updatedAt: new Date().toISOString() };
    const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
    // Wait for the first real Server Action before asserting loaded values;
    // cold development chunks may still be downloading after session bootstrap.
    const firstAction = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/app");
    await page.goto("/app");
    await firstAction;
    const preview = page.getByRole("region", { name: t("Live Tracking"), exact: true });
    await expect(preview.locator("dt")).toHaveText([t("Connected drivers"), t("Offline drivers"), t("No location yet")]);
    await expect(preview.locator("dd")).toHaveText([Number(0).toLocaleString(locale), Number(0).toLocaleString(locale), Number(2).toLocaleString(locale)]);
    await expect(preview.getByText(t("See your fleet at a glance"), { exact: true })).toBeVisible();
    await expect(preview.getByText(`${t("Last update")}: ${t("No updates yet")}`, { exact: true })).toBeVisible();
    await expect(preview.getByText(t("Driver locations will appear here once location sharing is enabled in the driver app."), { exact: true })).toBeVisible({ timeout: mapLoadTimeout });
    await expect(preview.getByRole("link", { name: t("Set your company headquarters"), exact: true })).toHaveCount(0);
    const marker = preview.getByRole("button", { name: translate(locale, "Headquarters for {company}", { company: user.company.name }), exact: true });
    await expect(marker).toBeVisible();
    await expect(preview.locator(".maplibregl-marker")).toHaveCount(1);
    const link = preview.getByRole("link", { name: t("Open full map"), exact: true });
    const pointsRight = await link.locator("svg").evaluate(svg => {
      if (!(svg instanceof SVGSVGElement)) throw new Error("Navigation icon is not SVG");
      const path = svg.querySelector("path");
      const matrix = svg.getScreenCTM();
      if (!path || !matrix) throw new Error("Rendered navigation arrow missing");
      const start = path.getPointAtLength(0).matrixTransform(matrix);
      const tip = path.getPointAtLength(16).matrixTransform(matrix);
      return tip.x > start.x;
    });
    expect(pointsRight).toBe(locale === "en");
    await page.screenshot({ path: testInfo.outputPath(`overview-${locale}.png`), fullPage: true });
    await link.click();
    await expect(page).toHaveURL(/\/app\/live-map$/);
    expect(saves).toBe(0);
  });

  for (const status of [404, 503]) {
    test(`overview ${status} stays unavailable until a successful zero-driver retry in ${locale}`, async ({ page, context }) => {
      await context.addCookies([{ name: "fleetora_locale", value: locale, url: "http://localhost:3100" }]);
      snapshotStatus = status;
      const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
      await page.goto("/app");
      const preview = page.getByRole("region", { name: t("Live Tracking"), exact: true });
      await expect(preview.getByRole("alert")).toContainText(t("Fleet tracking is temporarily unavailable. Please try again."));
      await expect(preview.locator("dd")).toHaveText(["—", "—", "—"]);
      await expect(preview.getByText(`${t("Last update")}: ${t("No updates yet")}`, { exact: true })).toHaveCount(0);
      await expect(preview.getByRole("link", { name: t("Set your company headquarters"), exact: true })).toHaveCount(0);
      snapshotStatus = 200; drivers = [];
      const previousRequests = snapshotRequests;
      await preview.getByRole("button", { name: t("Retry"), exact: true }).click();
      await expect(preview.locator("dd")).toHaveText(Array(3).fill(Number(0).toLocaleString(locale)));
      await expect(preview.getByText(`${t("Last update")}: ${t("No updates yet")}`, { exact: true })).toBeVisible();
      await expect(preview.getByRole("link", { name: t("Set your company headquarters"), exact: true })).toBeVisible();
      expect(snapshotRequests).toBeGreaterThan(previousRequests);
      expect(saves).toBe(0);
    });
  }
}

test("overview keeps counts unknown while the snapshot is loading", async ({ page }) => {
  let release!: () => void;
  pendingSnapshot = new Promise<void>(resolve => { release = resolve; });
  try {
    await page.goto("/app");
    const preview = page.getByRole("region", { name: "التتبع المباشر", exact: true });
    await expect.poll(() => snapshotRequests).toBeGreaterThan(0);
    await expect(preview.getByText("جارٍ تحميل بيانات الأسطول...", { exact: true })).toBeVisible();
    await expect(preview.locator("dd")).toHaveText(["—", "—", "—"]);
    release();
    await expect(preview.locator("dd")).toHaveText([Number(0).toLocaleString("ar"), Number(0).toLocaleString("ar"), Number(2).toLocaleString("ar")]);
    await expect(preview.getByText("آخر تحديث: لا يوجد بعد", { exact: true })).toBeVisible();
    await expect(preview.getByText("جارٍ تحميل بيانات الأسطول...", { exact: true })).toHaveCount(0);
  } finally { release(); }
});

test("overview keeps map retry and missing-headquarters action reachable when provider and transport fail", async ({ page }, testInfo) => {
  failTiles = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  const preview = page.getByRole("region", { name: "التتبع المباشر", exact: true });
  await expect(preview.getByText("الخريطة غير متاحة الآن", { exact: true })).toBeVisible();
  const retry = preview.getByRole("button", { name: "إعادة تحميل الخريطة", exact: true });
  await expect(retry).toBeVisible();
  await retry.click({ trial: true });
  const headquarters = preview.getByRole("link", { name: "تحديد مقر الشركة", exact: true });
  await headquarters.click({ trial: true });
  await page.screenshot({ path: testInfo.outputPath("fleet-preview-unavailable-mobile.png"), fullPage: true });
  await headquarters.click();
  await expect(page).toHaveURL(/\/app\/live-map$/);
  await page.getByRole("button", { name: "حدد مقر شركتك" }).click();
  await expect(page.getByRole("dialog", { name: "تحديد مقر الشركة" })).toBeVisible();
  expect(saves).toBe(0);
});

test("real no-GPS drivers, filters, selection and disconnected transport stay truthful", async ({ page }, testInfo) => {
  await openFleet(page);
  await expect(page.getByText("لم يشارك موقعه", { exact: true })).toHaveCount(2);
  await expect(page.getByText("جاري تحميل الخريطة…", { exact: true })).toHaveCount(0);
  await expect(page.getByText("الخريطة غير متاحة الآن", { exact: true })).toHaveCount(0);
  await expect(page.locator(".maplibregl-marker")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("fleet-desktop.png") });
  await page.getByRole("button", { name: "متصل", exact: true }).click();
  await expect(page.getByText("لا يوجد سائقون يطابقون البحث والتصفية.")).toBeVisible();
  await page.getByRole("button", { name: "غير متصل", exact: true }).click();
  await expect(page.getByText("لا يوجد سائقون يطابقون البحث والتصفية.")).toBeVisible();
  await expect(page.getByText("لم يشارك موقعه", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "الكل", exact: true }).click();
  await expect(page.getByText("لم يشارك موقعه", { exact: true })).toHaveCount(2);
  await page.getByRole("textbox", { name: /ابحث عن سائق/ }).fill("P-2");
  await expect(page.getByRole("button", { name: /سارة علي/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /أحمد حسن/ })).toHaveCount(0);
  await page.getByRole("button", { name: /سارة علي/ }).click();
  const details = page.getByRole("region", { name: "تفاصيل سارة علي" });
  await expect(details.getByText("لم تتم مشاركة الموقع", { exact: true })).toBeVisible();
  await expect(details.getByRole("button", { name: "تتبع هذا السائق" })).toBeDisabled();
  await expect(details.getByRole("link", { name: "اتصال" })).toHaveAttribute("href", "tel:+970599123456");
  await expect(page.getByText("البث المباشر متصل", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  drivers = Array.from({ length: 205 }, (_, index) => driver(String(index + 1), `سائق ${index + 1}`));
  await page.reload();
  const panel = page.getByRole("complementary", { name: "قائمة السائقين" });
  await expect(panel.locator("ul button")).toHaveCount(100);
  await panel.getByRole("button", { name: "عرض المزيد من السائقين" }).click();
  await expect(panel.locator("ul button")).toHaveCount(200);
  await panel.getByRole("textbox", { name: /ابحث عن سائق/ }).fill("P-205");
  await expect(panel.getByRole("button", { name: /سائق 205/ })).toBeVisible();
  await expect(panel.locator("ul button")).toHaveCount(1);
  denied = true;
  await page.reload();
  await expect(page.getByText("تعذر تحميل بيانات السائقين. أعد المحاولة عند استعادة الاتصال.")).toBeVisible();
  await expect(page.getByText("لم تتم إضافة سائقين بعد", { exact: true })).toHaveCount(0);
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "التتبع المباشر", exact: true })).toBeVisible();
  await expect(page.getByText("آخر تحديث: لا يوجد بعد", { exact: true })).toHaveCount(0);
});

test("headquarters save, cancel, validation and reload use the company fixture", async ({ page }) => {
  await openFleet(page);
  await page.getByRole("button", { name: "حدد مقر شركتك" }).click();
  const editor = page.getByRole("dialog", { name: "تحديد مقر الشركة" });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("button", { name: "حفظ الموقع" })).toBeDisabled();
  await editor.getByRole("spinbutton", { name: "خط العرض" }).fill("95");
  await editor.getByRole("spinbutton", { name: "خط الطول" }).fill("35.2");
  await expect(editor.getByRole("button", { name: "حفظ الموقع" })).toBeDisabled();
  await editor.getByRole("spinbutton", { name: "خط العرض" }).fill("31.9038");
  await editor.getByRole("textbox", { name: /العنوان/ }).fill("رام الله، المنطقة الصناعية");
  await editor.getByRole("button", { name: "حفظ الموقع" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByText("تم حفظ مقر الشركة.")).toBeVisible();
  await expect(page.getByRole("button", { name: "مقر شركة الأسطول" })).toBeVisible();
  await expect(page.getByText("الخريطة غير متاحة الآن", { exact: true })).toHaveCount(0);
  expect(saves).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "تعديل مقر الشركة" }).click();
  await expect(editor.getByRole("spinbutton", { name: "خط العرض" })).toHaveValue("31.9038");
  await editor.getByRole("spinbutton", { name: "خط العرض" }).fill("32");
  await editor.getByRole("button", { name: "إلغاء", exact: true }).click();
  expect(saves).toBe(1);
  expect(headquarters?.latitude).toBe(31.9038);
  await expect(page.getByRole("button", { name: "تعديل مقر الشركة" })).toBeFocused();
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "التتبع المباشر", exact: true })).toBeVisible();
  await expect(page.getByText("لم يتم تحديد مقر الشركة بعد")).toHaveCount(0);
  await expect(page.getByText("آخر تحديث: لا يوجد بعد", { exact: true })).toBeVisible();
});

test("uses the current browser location as an unsaved headquarters draft", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 31.7767, longitude: 35.2345 });
  await openFleet(page);
  await page.getByRole("button", { name: "حدد مقر شركتك" }).click();

  const editor = page.getByRole("dialog", { name: "تحديد مقر الشركة" });
  await editor.getByRole("button", { name: "استخدم موقعي الحالي" }).click();
  await expect(editor.getByRole("spinbutton", { name: "خط العرض" })).toHaveValue(
    "31.7767",
  );
  await expect(editor.getByRole("spinbutton", { name: "خط الطول" })).toHaveValue(
    "35.2345",
  );
  expect(saves).toBe(0);

  await editor.getByRole("button", { name: "إلغاء", exact: true }).click();
  expect(saves).toBe(0);
});

test("shows denied and timed-out location feedback without saving headquarters", async ({
  page,
  context,
}) => {
  await context.clearPermissions();
  await openFleet(page);
  await page.getByRole("button", { name: "حدد مقر شركتك" }).click();
  let editor = page.getByRole("dialog", { name: "تحديد مقر الشركة" });
  await editor.getByRole("button", { name: "استخدم موقعي الحالي" }).click();
  await expect(editor.getByRole("alert")).toContainText(
    "اسمح بالوصول إلى الموقع من أذونات الموقع في المتصفح",
  );
  await editor.getByRole("button", { name: "إلغاء", exact: true }).click();

  await page.addInitScript(() => {
    const timeoutError: GeolocationPositionError = {
      code: 3,
      message: "Location request timed out.",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    };
    const geolocation: Pick<Geolocation, "getCurrentPosition"> = {
      getCurrentPosition(_success, error) {
        error?.(timeoutError);
      },
    };
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: geolocation,
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "حدد مقر شركتك" }).click();
  editor = page.getByRole("dialog", { name: "تحديد مقر الشركة" });
  await editor.getByRole("button", { name: "استخدم موقعي الحالي" }).click();
  await expect(editor.getByRole("alert")).toContainText(
    "انتهت مهلة طلب الموقع",
  );
  expect(saves).toBe(0);
});

test("mobile map and driver sheet remain usable with keyboard controls", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFleet(page);
  await expect(page.getByRole("banner").getByRole("heading", { name: "التتبع المباشر", exact: true })).toBeVisible();
  await expect(page.getByText("جاري تحميل الخريطة…", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("fleet-mobile.png") });
  await page.getByRole("button", { name: "إخفاء قائمة السائقين" }).click();
  await expect(page.getByRole("complementary", { name: "قائمة السائقين" })).toHaveCount(0);
  await page.getByRole("button", { name: /^السائقون/ }).click();
  await page.getByRole("textbox", { name: /ابحث عن سائق/ }).fill("أحمد");
  await page.getByRole("button", { name: /أحمد حسن/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "تفاصيل أحمد حسن" })).toBeVisible();
  await page.getByRole("button", { name: "إغلاق تفاصيل السائق" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

test("map click, draggable preview and saved headquarters popup work on the actual canvas", async ({ page }, testInfo) => {
  await openFleet(page);
  await expect(page.getByText("جاري تحميل الخريطة…", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "حدد مقر شركتك" }).click();
  const editor = page.getByRole("dialog", { name: "تحديد مقر الشركة" });
  const canvas = page.getByTestId("fleet-map").locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Map canvas is unavailable");
  expect(box.height).toBeGreaterThan(400);
  expect(box.width).toBeGreaterThan(600);
  await page.mouse.click(box.x + box.width * 0.58, box.y + box.height * 0.3);
  const latitude = editor.getByRole("spinbutton", { name: "خط العرض" });
  await expect(latitude).not.toHaveValue("");
  const longitude = editor.getByRole("spinbutton", { name: "خط الطول" });
  const selectedLongitude = await longitude.inputValue();
  const temporary = page.locator('[aria-label="موقع المقر المقترح — اسحب لتعديله"]');
  await expect(temporary).toBeVisible();
  const marker = await temporary.boundingBox();
  if (!marker) throw new Error("Temporary marker is unavailable");
  await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
  await page.mouse.down();
  await page.mouse.move(marker.x + marker.width / 2 + 45, marker.y + marker.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(longitude).not.toHaveValue(selectedLongitude);
  await editor.getByRole("textbox", { name: /العنوان/ }).fill("مقر الاختبار المعزول");
  await editor.getByRole("button", { name: "حفظ الموقع" }).click();
  await expect(editor).toHaveCount(0);
  expect(saves).toBe(1);
  const headquartersMarker = page.getByRole("button", { name: "مقر شركة الأسطول", exact: true });
  await expect(headquartersMarker).toBeVisible();
  await headquartersMarker.click();
  await expect(page.getByText("أسطولك، في مكان واحد", { exact: true })).toHaveCount(0);
  const popup = page.locator(".maplibregl-popup");
  await expect(popup.getByText("شركة الأسطول", { exact: true })).toBeVisible();
  await expect(popup.getByText("مقر الاختبار المعزول", { exact: true })).toBeVisible();
  await expect(popup.getByRole("button", { name: "التركيز على المقر" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("fleet-headquarters.png") });
  await popup.getByRole("button", { name: "تعديل المقر", exact: true }).click();
  await expect(editor).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  expect(saves).toBe(1);
});
