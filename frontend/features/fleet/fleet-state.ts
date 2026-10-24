import type {
  FleetDriver, FleetHeadquartersEvent, FleetLocation, FleetSnapshot,
  FleetTracking, FleetTrackingEvent, Headquarters, HeadquartersInput,
} from "./fleet.types";

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const text = (value: unknown): value is string => typeof value === "string";
const nullableText = (value: unknown): value is string | null => value === null || text(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const revision = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value) && value >= 0;
const date = (value: unknown): value is string => text(value) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const latitude = (value: unknown): value is number => finite(value) && value >= -90 && value <= 90;
const longitude = (value: unknown): value is number => finite(value) && value >= -180 && value <= 180;
const nullableNumber = (value: unknown): value is number | null => value === null || finite(value);
function coordinatePrecision(value: number): boolean {
  const [coefficient, exponent = "0"] = value.toString().split("e");
  return Math.max(0, (coefficient.split(".")[1]?.length ?? 0) - Number(exponent)) <= 7;
}

export function validHeadquartersInput(value: unknown): value is HeadquartersInput {
  return record(value) && latitude(value.latitude) && longitude(value.longitude) &&
    coordinatePrecision(value.latitude) && coordinatePrecision(value.longitude) &&
    nullableText(value.address) && (value.address === null || value.address.length <= 300) &&
    revision(value.expectedRevision) && value.expectedRevision <= 2147483646;
}
export function parseHeadquarters(value: unknown): Headquarters | null {
  if (!record(value) || !latitude(value.latitude) || !longitude(value.longitude) ||
    !nullableText(value.address) || !revision(value.revision) || !date(value.updatedAt)) return null;
  return { latitude: value.latitude, longitude: value.longitude, address: value.address,
    revision: value.revision, updatedAt: value.updatedAt };
}
function parseLocation(value: unknown): FleetLocation | null {
  if (!record(value) || !latitude(value.latitude) || !longitude(value.longitude) ||
    !date(value.capturedAt) || !date(value.receivedAt) || !nullableNumber(value.accuracy) ||
    !nullableNumber(value.speed) || !nullableNumber(value.heading) ||
    (value.accuracy !== null && (value.accuracy < 0 || value.accuracy > 10_000)) ||
    (value.speed !== null && (value.speed < 0 || value.speed > 100)) ||
    (value.heading !== null && (value.heading < 0 || value.heading >= 360))) return null;
  return { latitude: value.latitude, longitude: value.longitude, capturedAt: value.capturedAt,
    receivedAt: value.receivedAt, accuracy: value.accuracy, speed: value.speed, heading: value.heading };
}
function parseTracking(value: unknown): FleetTracking | null {
  if (!record(value) || !revision(value.revision) || typeof value.sharing !== "boolean" ||
    !(value.sharingStartedAt === null || date(value.sharingStartedAt))) return null;
  const location = value.location === null ? null : parseLocation(value.location);
  if (value.location !== null && !location) return null;
  if (value.sharing && !value.sharingStartedAt) return null;
  return { revision: value.revision, sharing: value.sharing, sharingStartedAt: value.sharingStartedAt, location };
}
function parseVehicle(value: unknown): FleetDriver["vehicle"] {
  if (!record(value) || !text(value.id) || !text(value.plateNumber) ||
    !nullableText(value.manufacturer) || !nullableText(value.model)) return null;
  const type = value.type;
  if (type !== "MOTORCYCLE" && type !== "CAR" && type !== "VAN" && type !== "TRUCK") return null;
  return { id: value.id, plateNumber: value.plateNumber, manufacturer: value.manufacturer, model: value.model, type };
}
export function parseSnapshot(value: unknown, companyId: string): FleetSnapshot | null {
  if (!record(value) || value.companyId !== companyId || !date(value.serverTime) ||
    !finite(value.freshnessSeconds) || value.freshnessSeconds <= 0 || !Array.isArray(value.drivers)) return null;
  const headquarters = value.headquarters === null ? null : parseHeadquarters(value.headquarters);
  if (value.headquarters !== null && !headquarters) return null;
  const drivers: FleetDriver[] = [];
  const ids = new Set<string>();
  for (const item of value.drivers) {
    if (!record(item) || !text(item.id) || !item.id || ids.has(item.id) || !text(item.name) || !text(item.phone)) return null;
    const tracking = parseTracking(item.tracking);
    const vehicle = item.vehicle === null ? null : parseVehicle(item.vehicle);
    if (!tracking || (item.vehicle !== null && !vehicle)) return null;
    ids.add(item.id);
    drivers.push({ id: item.id, name: item.name, phone: item.phone, vehicle, tracking });
  }
  return { companyId, serverTime: value.serverTime, freshnessSeconds: value.freshnessSeconds, headquarters, drivers };
}
export function parseTrackingEvent(value: unknown, companyId: string): FleetTrackingEvent | null {
  if (!record(value) || value.companyId !== companyId || !text(value.driverId) || !value.driverId || !date(value.serverTime)) return null;
  const tracking = parseTracking(value.tracking);
  return tracking ? { companyId, driverId: value.driverId, serverTime: value.serverTime, tracking } : null;
}
export function parseHeadquartersEvent(value: unknown, companyId: string): FleetHeadquartersEvent | null {
  if (!record(value) || value.companyId !== companyId) return null;
  const headquarters = parseHeadquarters(value.headquarters);
  return headquarters ? { companyId, headquarters } : null;
}

/** A location must belong to the active sharing session and have two fresh clocks. */
export function isDriverOnline(driver: FleetDriver, now: number, freshnessSeconds: number): boolean {
  const { sharing, sharingStartedAt, location } = driver.tracking;
  if (!sharing || !sharingStartedAt || !location) return false;
  const started = Date.parse(sharingStartedAt);
  const captured = Date.parse(location.capturedAt);
  const received = Date.parse(location.receivedAt);
  const window = freshnessSeconds * 1000;
  return Number.isFinite(started) && captured >= started && received >= started &&
    now - captured <= window && now - received <= window && captured <= now + 10_000 && received <= now + 10_000;
}

/** Revision merging also buffers events received before the first REST snapshot. */
export class FleetReconciler {
  private tracking = new Map<string, FleetTracking>();
  private headquarters: Headquarters | null = null;
  snapshot: FleetSnapshot | null = null;
  constructor(readonly companyId: string) {}
  acceptSnapshot(snapshot: FleetSnapshot): FleetSnapshot | null {
    if (snapshot.companyId !== this.companyId) return this.snapshot;
    for (const driver of snapshot.drivers) this.acceptTracking(driver.id, driver.tracking);
    this.acceptHeadquarters(snapshot.headquarters);
    this.snapshot = { ...snapshot, headquarters: this.headquarters,
      drivers: snapshot.drivers.map(driver => ({ ...driver, tracking: this.tracking.get(driver.id) ?? driver.tracking })) };
    return this.snapshot;
  }
  private acceptTracking(id: string, value: FleetTracking) {
    if (value.revision > (this.tracking.get(id)?.revision ?? -1)) this.tracking.set(id, value);
  }
  private acceptHeadquarters(value: Headquarters | null) {
    if (value && value.revision > (this.headquarters?.revision ?? -1)) this.headquarters = value;
  }
  acceptTrackingEvent(event: FleetTrackingEvent): FleetSnapshot | null {
    if (event.companyId !== this.companyId) return this.snapshot;
    this.acceptTracking(event.driverId, event.tracking);
    if (this.snapshot) this.snapshot = { ...this.snapshot, drivers: this.snapshot.drivers.map(driver =>
      driver.id === event.driverId ? { ...driver, tracking: this.tracking.get(driver.id) ?? driver.tracking } : driver) };
    return this.snapshot;
  }
  acceptHeadquartersEvent(event: FleetHeadquartersEvent): FleetSnapshot | null {
    if (event.companyId !== this.companyId) return this.snapshot;
    this.acceptHeadquarters(event.headquarters);
    if (this.snapshot) this.snapshot = { ...this.snapshot, headquarters: this.headquarters };
    return this.snapshot;
  }
}
