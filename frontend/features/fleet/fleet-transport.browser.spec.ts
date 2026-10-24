import { createServer, type Server } from "node:http";
import { expect, test, type WebSocketRoute } from "@playwright/test";
import type { FleetDriver, FleetSnapshot, FleetTracking } from "./fleet.types";

const admin = (companyId: string) => ({ id: `admin-${companyId}`, name: "مدير الشركة", email: null,
  role: "COMPANY_ADMIN", orgId: companyId, company: { id: companyId, name: companyId } });
function tracking(revision: number, latitude: number): FleetTracking {
  const now = Date.now();
  return { revision, sharing: true, sharingStartedAt: new Date(now - 60_000).toISOString(), location: {
    latitude, longitude: 35.2, capturedAt: new Date(now - 1000).toISOString(), receivedAt: new Date(now).toISOString(),
    accuracy: 5, speed: 5, heading: 90,
  } };
}
function driver(companyId: string, state = tracking(1, 31.7)): FleetDriver {
  return { id: `driver-${companyId}`, name: companyId === "company-a" ? "سائق الشركة الأولى" : "سائق الشركة الثانية",
    phone: "+970599123456", vehicle: null, tracking: state };
}
let server: Server;
let companyId = "company-a";
let drivers: FleetDriver[];
let tickets = 0;
let snapshots = 0;
let holdSnapshot = false;
let snapshotStatus = 200;
let ticketStatus = 200;
let logoutRequests = 0;
let releases: (() => void)[] = [];
let logoutReleases: (() => void)[] = [];
let sockets: { route: WebSocketRoute; ticket: string; closed: boolean }[] = [];

test.beforeAll(async () => {
  server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    const respond = (data: unknown) => response.end(JSON.stringify({ success: true, data }));
    if (request.url === "/auth/session") return respond(admin(companyId));
    if (request.url === "/auth/logout") {
      logoutRequests += 1;
      logoutReleases.push(() => respond(null));
      return;
    }
    if (request.url === "/fleet/socket-ticket") {
      tickets += 1;
      if (ticketStatus !== 200) { response.writeHead(ticketStatus).end(); return; }
      return respond({ companyId, ticket: `${String(tickets).padStart(43, "A")}`, expiresAt: new Date(Date.now() + 30_000).toISOString() });
    }
    if (request.url === "/fleet/locations") {
      snapshots += 1;
      if (snapshotStatus !== 200) { response.writeHead(snapshotStatus).end(); return; }
      // Capture at request time to reproduce an old REST response arriving after a socket event.
      const snapshot: FleetSnapshot = { companyId, serverTime: new Date().toISOString(), freshnessSeconds: 45,
        headquarters: null, drivers: structuredClone(drivers) };
      if (holdSnapshot) releases.push(() => respond(snapshot));
      else respond(snapshot);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(3101, "127.0.0.1", resolve); });
});
test.beforeEach(async ({ page, context }) => {
  companyId = "company-a"; drivers = [driver(companyId)]; tickets = 0; snapshots = 0;
  holdSnapshot = false; releases = []; sockets = [];
  snapshotStatus = 200; ticketStatus = 200; logoutRequests = 0; logoutReleases = [];
  await context.addCookies([{ name: "fleetora_access", value: "fixture-server-only-access", url: "http://localhost:3100", httpOnly: true }]);
  await context.addCookies([{ name: "fleetora_locale", value: "ar", url: "http://localhost:3100" }]);
  await page.route("https://tiles.openfreemap.org/**", route => route.abort());
  // Real socket.io-client, with a local Engine.IO/Socket.IO protocol fixture.
  await page.routeWebSocket(/\/socket\.io\//, route => {
    const entry = { route, ticket: "", closed: false };
    sockets.push(entry);
    route.onClose(() => { entry.closed = true; });
    route.onMessage(message => {
      if (typeof message !== "string") return;
      if (message.startsWith("40/fleet,")) {
        const auth: unknown = JSON.parse(message.slice("40/fleet,".length));
        if (!auth || typeof auth !== "object" || !("ticket" in auth) || typeof auth.ticket !== "string") return;
        entry.ticket = auth.ticket;
        route.send(`40/fleet,${JSON.stringify({ sid: `fleet-${sockets.length}` })}`);
        route.send(`42/fleet,${JSON.stringify(["fleet:ready", { companyId }])}`);
      }
      if (message === "2") route.send("3");
    });
    route.send(`0${JSON.stringify({ sid: `engine-${sockets.length}`, upgrades: [], pingInterval: 25_000, pingTimeout: 20_000, maxPayload: 1_000_000 })}`);
  });
});
test.afterEach(() => {
  for (const release of releases.splice(0)) release();
  for (const release of logoutReleases.splice(0)) release();
});
test.afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });

function emit(index: number, name: string, data: unknown) {
  sockets[index].route.send(`42/fleet,${JSON.stringify([name, data])}`);
}
function locationEvent(state: FleetTracking, eventCompany = companyId) {
  return { companyId: eventCompany, driverId: `driver-${eventCompany}`, serverTime: new Date().toISOString(), tracking: state };
}

test("a ready transport does not claim GPS is streaming and recent locations remain distinct", async ({ page }) => {
  drivers = [{ ...driver(companyId), tracking: { revision: 0, sharing: false, sharingStartedAt: null, location: null } }];
  await page.goto("/app/live-map");
  await expect(page.getByText("جاهز", { exact: true })).toBeVisible();
  await expect(page.getByText("البث المباشر متصل", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "قائمة السائقين" }).locator('[aria-busy]')).toHaveAttribute("aria-busy", "false");
  emit(0, "fleet:location-updated", locationEvent(tracking(1, 31.8)));
  await expect(page.getByText("مواقع سائقين حديثة", { exact: true })).toBeVisible();
  const stopped = { ...tracking(2, 31.8), sharing: false };
  emit(0, "fleet:driver-status-changed", locationEvent(stopped));
  await expect(page.getByText("جاهز", { exact: true })).toBeVisible();
  await sockets[0].route.close({ code: 1012, reason: "fixture restart" });
  await expect(page.getByText("جارٍ إعادة الاتصال...", { exact: true })).toBeVisible();
});

test("buffers the initial snapshot, ignores older updates, and reconnects with a fresh ticket and snapshot", async ({ page }) => {
  holdSnapshot = true;
  await page.goto("/app/live-map");
  await expect.poll(() => releases.length).toBe(1);
  emit(0, "fleet:location-updated", locationEvent(tracking(3, 31.88)));
  releases.shift()?.();
  holdSnapshot = false;
  const row = page.getByRole("button", { name: /سائق الشركة الأولى/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByText("31.88000, 35.20000", { exact: true })).toBeVisible();
  emit(0, "fleet:location-updated", locationEvent(tracking(2, 31.71)));
  await expect(page.getByText("31.88000, 35.20000", { exact: true })).toBeVisible();
  drivers = [driver(companyId, tracking(4, 31.99))];
  await sockets[0].route.close({ code: 1012, reason: "fixture restart" });
  await expect(page.getByText("31.88000, 35.20000", { exact: true })).toBeVisible();
  await expect.poll(() => tickets).toBe(2);
  await expect.poll(() => snapshots).toBe(2);
  await expect(page.getByText("31.99000, 35.20000", { exact: true })).toBeVisible();
  expect(sockets[0].ticket).not.toBe(sockets[1].ticket);
  expect(sockets[1].ticket).not.toContain("fixture-server-only-access");
  expect(sockets[1].ticket).toHaveLength(43);
});

test("session invalidation closes the old socket and discards a late old-company snapshot", async ({ page }) => {
  holdSnapshot = true;
  await page.goto("/app/live-map");
  await expect.poll(() => releases.length).toBe(1);
  companyId = "company-b";
  drivers = [driver(companyId)];
  await page.evaluate(() => {
    const channel = new BroadcastChannel("fleetora-session");
    channel.postMessage("session-invalidated");
    channel.close();
  });
  await expect(page.getByRole("complementary", { name: "قائمة السائقين" })).toHaveCount(0);
  await expect.poll(() => sockets[0].closed).toBe(true);
  holdSnapshot = false;
  releases.shift()?.();
  await expect(page.getByRole("button", { name: /سائق الشركة الثانية/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /سائق الشركة الأولى/ })).toHaveCount(0);
  expect(tickets).toBe(2);
});

test("explicit retry refreshes known data after schema recovery while realtime is unavailable", async ({ page }) => {
  await page.goto("/app/live-map");
  const row = page.getByRole("button", { name: /سائق الشركة الأولى/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByText("31.70000, 35.20000", { exact: true })).toBeVisible();
  snapshotStatus = 503;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("fleetora-vehicles-changed", {
    detail: { userId: "admin-company-a", companyId: "company-a" },
  })));
  await expect(page.getByText("تعذّر تحميل تتبّع الأسطول مؤقتًا. حاول مرة أخرى.", { exact: true })).toBeVisible();
  snapshotStatus = 200;
  ticketStatus = 503;
  drivers = [driver(companyId, tracking(2, 32.01))];
  await page.getByRole("button", { name: "إعادة المحاولة", exact: true }).click();
  await expect.poll(() => snapshots).toBeGreaterThanOrEqual(3);
  await expect(page.getByText("32.01000, 35.20000", { exact: true })).toBeVisible();
  await expect.poll(() => sockets[0].closed).toBe(true);
  await expect(row).not.toContainText("متصل الآن");
});

test("logout clears company data and disconnects the socket before revocation completes", async ({ page }) => {
  await page.goto("/app/live-map");
  await expect(page.getByRole("button", { name: /سائق الشركة الأولى/ })).toBeVisible();
  await page.getByRole("button", { name: /Log out|تسجيل الخروج/ }).click();
  await expect.poll(() => logoutRequests).toBe(1);
  await expect(page.getByRole("complementary", { name: "قائمة السائقين" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /سائق الشركة الأولى/ })).toHaveCount(0);
  await expect.poll(() => sockets[0].closed).toBe(true);
  logoutReleases.shift()?.();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test("overview replaces the previous map when a focus check discovers a new company", async ({ page }) => {
  await page.goto("/app");
  await expect.poll(() => snapshots).toBe(1);
  const previousMap = await page.getByTestId("fleet-map").elementHandle();
  if (!previousMap) throw new Error("Overview map is unavailable");
  companyId = "company-b";
  drivers = [driver(companyId)];
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("header").getByTitle("company-b", { exact: true })).toBeVisible();
  await expect.poll(() => previousMap.evaluate(node => node.isConnected)).toBe(false);
  await expect.poll(() => sockets[0].closed).toBe(true);
  await expect.poll(() => tickets).toBe(2);
  await expect.poll(() => snapshots).toBe(2);
});
