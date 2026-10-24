import { expect, test } from "@playwright/test";
import { fleetMapData } from "./fleet-map-data";
import type { FleetDriver } from "./fleet.types";

const now = Date.parse("2026-10-19T12:00:00Z");
const driver: FleetDriver = { id: "real-driver", name: "Driver", phone: "", vehicle: null, tracking: {
  revision: 1, sharing: true, sharingStartedAt: new Date(now - 30_000).toISOString(), location: {
    latitude: 31.9, longitude: 35.2, capturedAt: new Date(now - 1000).toISOString(), receivedAt: new Date(now - 500).toISOString(), heading: null, accuracy: null, speed: null,
  },
} };
const options = { now, freshnessSeconds: 45, connected: true };

test("never-shared drivers produce no GeoJSON points", () => {
  expect(fleetMapData([{ ...driver, tracking: { ...driver.tracking, location: null } }], options).features).toEqual([]);
  expect(fleetMapData([], options).features).toEqual([]);
});
test("invalid numeric and out-of-bounds positions never reach the map source", () => {
  for (const point of [{ latitude: NaN, longitude: 35 }, { latitude: 31, longitude: Infinity }, { latitude: 91, longitude: 35 }, { latitude: 31, longitude: -181 }]) {
    const invalid: FleetDriver = { ...driver, tracking: { ...driver.tracking, location: { ...driver.tracking.location!, ...point } } };
    expect(fleetMapData([invalid], options).features).toEqual([]);
  }
});
test("stale and disconnected locations stay at their real coordinates with muted state", () => {
  const stale = fleetMapData([driver], { ...options, now: now + 46_000 });
  expect(stale.features[0].geometry.coordinates).toEqual([35.2, 31.9]);
  expect(stale.features[0].properties.online).toBe(false);
  expect(fleetMapData([driver], { ...options, connected: false }).features[0].properties.online).toBe(false);
  expect(fleetMapData([driver], options).features[0].properties.online).toBe(true);
});
test("only valid real heading enables an arrow and selection preserves the driver ID", () => {
  for (const heading of [null, NaN, -1, 360]) {
    const point: FleetDriver = { ...driver, tracking: { ...driver.tracking, location: { ...driver.tracking.location!, heading } } };
    expect(fleetMapData([point], options).features[0].properties.hasHeading).toBe(false);
  }
  const point: FleetDriver = { ...driver, tracking: { ...driver.tracking, location: { ...driver.tracking.location!, heading: 90 } } };
  expect(fleetMapData([point], { ...options, selectedId: driver.id }).features[0].properties).toMatchObject({ id: driver.id, selected: true, hasHeading: true, heading: 90 });
});
