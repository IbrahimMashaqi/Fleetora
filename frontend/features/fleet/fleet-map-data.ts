import type { FeatureCollection, Point } from "geojson";
import type { FleetDriver } from "./fleet.types";
import { isDriverOnline } from "./fleet-state";

export function validMapCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

type DriverPoint = { id: string; selected: boolean; online: boolean; hasHeading: boolean; heading: number };
export function fleetMapData(drivers: FleetDriver[], options: {
  now: number; freshnessSeconds: number; connected: boolean; selectedId?: string | null;
  positions?: ReadonlyMap<string, [number, number]>;
}): FeatureCollection<Point, DriverPoint> {
  return {
    type: "FeatureCollection",
    features: drivers.flatMap(driver => {
      const location = driver.tracking.location;
      if (!location || !validMapCoordinate(location.latitude, location.longitude)) return [];
      const position = options.positions?.get(driver.id);
      const coordinates = position && validMapCoordinate(position[1], position[0]) ? position : [location.longitude, location.latitude];
      const hasHeading = location.heading !== null && Number.isFinite(location.heading) && location.heading >= 0 && location.heading < 360;
      return [{ type: "Feature", geometry: { type: "Point", coordinates }, properties: {
        id: driver.id, selected: driver.id === options.selectedId,
        online: options.connected && isDriverOnline(driver, options.now, options.freshnessSeconds),
        hasHeading, heading: hasHeading ? location.heading! : 0,
      } }];
    }),
  };
}
