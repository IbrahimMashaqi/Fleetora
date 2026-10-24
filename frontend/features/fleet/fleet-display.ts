import type { FleetConnection, FleetDriver } from "./fleet.types";
import { translate, type Locale } from "@/lib/i18n";
import { isDriverOnline } from "./fleet-state";

export function fleetConnectionLabel(connection: FleetConnection, drivers: FleetDriver[], now: number, freshnessSeconds: number) {
  const labels = { connected: "Ready", connecting: "Connecting...", reconnecting: "Reconnecting...", disconnected: "Connection lost" } as const;
  return connection === "connected" && drivers.some(driver => isDriverOnline(driver, now, freshnessSeconds))
    ? "Recent driver locations" : labels[connection];
}

export function relativeLocation(timestamp: string | null | undefined, now: number, locale: Locale) {
  if (!timestamp) return translate(locale, "No shared location");
  const seconds = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 1000));
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (seconds < 10) return translate(locale, "Just now");
  if (seconds < 60) return formatter.format(-seconds, "second");
  if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return formatter.format(-Math.floor(seconds / 3600), "hour");
  return formatter.format(-Math.floor(seconds / 86400), "day");
}

export function driverVehicle(driver: FleetDriver, locale: Locale) {
  const labels = {
    MOTORCYCLE: translate(locale, "Motorcycle"),
    CAR: translate(locale, "Car"),
    VAN: translate(locale, "Van"),
    TRUCK: translate(locale, "Truck"),
    noVehicle: translate(locale, "No vehicle assigned"),
  };
  return driver.vehicle ? [driver.vehicle.manufacturer, driver.vehicle.model].filter(Boolean).join(" ") || labels[driver.vehicle.type] : labels.noVehicle;
}

export function validTelephone(phone: string) {
  const cleaned = phone.replace(/[\s().-]/g, "");
  return /^\+?\d{7,15}$/.test(cleaned) ? cleaned : null;
}
