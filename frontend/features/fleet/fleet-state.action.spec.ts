import { test, expect } from "@playwright/test";
import { FleetReconciler, isDriverOnline, parseHeadquartersEvent, parseSnapshot, parseTrackingEvent, validHeadquartersInput } from "./fleet-state";
import type { FleetDriver, FleetSnapshot, Headquarters } from "./fleet.types";

const now = Date.parse("2026-10-17T10:00:00.000Z");
const location = { latitude: 31.5, longitude: 35.1, capturedAt: new Date(now - 10_000).toISOString(), receivedAt: new Date(now - 5000).toISOString(), accuracy: null, speed: 0, heading: null };
const driver: FleetDriver = { id: "driver-a", name: "Driver", phone: "+97012345678", vehicle: null,
  tracking: { revision: 1, sharing: true, sharingStartedAt: new Date(now - 30_000).toISOString(), location } };
const headquarters: Headquarters = { latitude: 31, longitude: 35, address: null, revision: 1, updatedAt: new Date(now).toISOString() };
function snapshot(): FleetSnapshot {
  return { companyId: "company-a", serverTime: new Date(now).toISOString(), freshnessSeconds: 60, headquarters, drivers: [structuredClone(driver)] };
}
test("allowlists the full wire projection without authentication fields", () => {
  const input = { ...snapshot(), secret: "private", drivers: [{ ...driver, passwordHash: "private", tracking: { ...driver.tracking, sessionId: "private" } }] };
  expect(parseSnapshot(input, "company-a")).toEqual(snapshot());
  expect(JSON.stringify(parseSnapshot(input, "company-a"))).not.toContain("private");
});
test("rejects malformed and cross-company snapshots", () => {
  expect(parseSnapshot(snapshot(), "company-b")).toBeNull();
  expect(parseSnapshot({ ...snapshot(), drivers: [driver, driver] }, "company-a")).toBeNull();
  expect(parseSnapshot({ ...snapshot(), headquarters: { ...headquarters, latitude: 91 } }, "company-a")).toBeNull();
  expect(parseSnapshot({ ...snapshot(), drivers: [{ ...driver, tracking: { ...driver.tracking, location: { ...location, latitude: "31" } } }] }, "company-a")).toBeNull();
});
test("requires actual sharing, a new-session point, and both fresh timestamps", () => {
  expect(isDriverOnline(driver, now, 60)).toBe(true);
  expect(isDriverOnline(driver, now + 50_000, 60)).toBe(true);
  expect(isDriverOnline(driver, now + 50_001, 60)).toBe(false);
  expect(isDriverOnline(driver, now + 61_000, 60)).toBe(false);
  expect(isDriverOnline({ ...driver, tracking: { ...driver.tracking, sharing: false } }, now, 60)).toBe(false);
  expect(isDriverOnline({ ...driver, tracking: { ...driver.tracking, sharingStartedAt: new Date(now).toISOString() } }, now, 60)).toBe(false);
  for (const field of ["capturedAt", "receivedAt"] as const) {
    expect(isDriverOnline({ ...driver, tracking: { ...driver.tracking, location: { ...location, [field]: new Date(now - 61_000).toISOString() } } }, now, 60)).toBe(false);
  }
});
test("buffers events during the initial snapshot and retains newer revisions", () => {
  const state = new FleetReconciler("company-a");
  const tracking = { ...driver.tracking, revision: 3, location: { ...location, latitude: 32 } };
  state.acceptTrackingEvent({ companyId: "company-a", driverId: driver.id, serverTime: new Date(now).toISOString(), tracking });
  state.acceptHeadquartersEvent({ companyId: "company-a", headquarters: { ...headquarters, revision: 4, address: "New office" } });
  const result = state.acceptSnapshot(snapshot());
  expect(result?.drivers[0].tracking).toEqual(tracking);
  expect(result?.headquarters?.revision).toBe(4);
  state.acceptSnapshot(snapshot());
  expect(state.snapshot?.drivers[0].tracking.revision).toBe(3);
});
test("deduplicates equal and older events without rolling back status", () => {
  const state = new FleetReconciler("company-a");
  state.acceptSnapshot(snapshot());
  const event = { companyId: "company-a", driverId: driver.id, serverTime: new Date(now).toISOString(), tracking: { ...driver.tracking, revision: 5, sharing: false } };
  state.acceptTrackingEvent(event);
  state.acceptTrackingEvent({ ...event, tracking: { ...driver.tracking, revision: 5 } });
  state.acceptTrackingEvent({ ...event, tracking: { ...driver.tracking, revision: 4 } });
  expect(state.snapshot?.drivers[0].tracking.sharing).toBe(false);
});
test("tenant-scoped state rejects late old-company snapshots and events", () => {
  const state = new FleetReconciler("company-b");
  expect(state.acceptSnapshot(snapshot())).toBeNull();
  expect(state.acceptTrackingEvent({ companyId: "company-a", driverId: driver.id, serverTime: new Date(now).toISOString(), tracking: driver.tracking })).toBeNull();
  expect(state.acceptHeadquartersEvent({ companyId: "company-a", headquarters })).toBeNull();
});
test("refreshed roster removes deleted drivers while reconciling retained tracking", () => {
  const state = new FleetReconciler("company-a");
  state.acceptSnapshot(snapshot());
  state.acceptSnapshot({ ...snapshot(), drivers: [] });
  expect(state.snapshot?.drivers).toEqual([]);
});
test("validates realtime payloads and headquarters writes at the boundary", () => {
  const event = { companyId: "company-a", driverId: driver.id, serverTime: new Date(now).toISOString(), tracking: driver.tracking };
  expect(parseTrackingEvent(event, "company-a")).toEqual(event);
  expect(parseTrackingEvent(event, "company-b")).toBeNull();
  expect(parseTrackingEvent({ ...event, tracking: { ...driver.tracking, revision: -1 } }, "company-a")).toBeNull();
  expect(parseHeadquartersEvent({ companyId: "company-a", headquarters }, "company-b")).toBeNull();
  expect(validHeadquartersInput({ latitude: 31, longitude: 35, address: null, expectedRevision: 0 })).toBe(true);
  expect(validHeadquartersInput({ latitude: 31, longitude: 181, address: null, expectedRevision: 0 })).toBe(false);
  expect(validHeadquartersInput({ latitude: 31.12345678, longitude: 35, address: null, expectedRevision: 0 })).toBe(false);
  expect(validHeadquartersInput({ latitude: 31, longitude: 35, address: "a".repeat(301), expectedRevision: 0 })).toBe(false);
});
