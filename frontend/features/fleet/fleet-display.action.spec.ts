import { expect, test } from "@playwright/test";
import { fleetConnectionLabel } from "./fleet-display";
import type { FleetDriver } from "./fleet.types";

const now = Date.parse("2026-10-21T10:00:00Z");
const driver: FleetDriver = { id: "fixture", name: "Fixture", phone: "", vehicle: null,
  tracking: { revision: 1, sharing: true, sharingStartedAt: new Date(now - 60_000).toISOString(), location: {
    latitude: 31.8, longitude: 35.2, capturedAt: new Date(now - 1000).toISOString(), receivedAt: new Date(now - 500).toISOString(), accuracy: null, heading: null, speed: null,
  } } };

test("transport readiness without fresh sharing data is Ready", () => {
  expect(fleetConnectionLabel("connected", [], now, 45)).toBe("Ready");
  expect(fleetConnectionLabel("connected", [{ ...driver, tracking: { ...driver.tracking, location: null } }], now, 45)).toBe("Ready");
  expect(fleetConnectionLabel("connected", [driver], now + 46_000, 45)).toBe("Ready");
  expect(fleetConnectionLabel("connected", [{ ...driver, tracking: { ...driver.tracking, sharing: false } }], now, 45)).toBe("Ready");
});

test("recent driver data is described without claiming an incoming GPS stream", () => {
  expect(fleetConnectionLabel("connected", [driver], now, 45)).toBe("Recent driver locations");
});

test("fresh positions never hide truthful disconnected and reconnecting states", () => {
  expect(fleetConnectionLabel("disconnected", [driver], now, 45)).toBe("Connection lost");
  expect(fleetConnectionLabel("reconnecting", [driver], now, 45)).toBe("Reconnecting...");
  expect(fleetConnectionLabel("connecting", [driver], now, 45)).toBe("Connecting...");
});
