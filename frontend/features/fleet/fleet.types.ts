export type FleetLocation = {
  latitude: number;
  longitude: number;
  capturedAt: string;
  receivedAt: string;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
};
export type FleetTracking = {
  revision: number;
  sharing: boolean;
  sharingStartedAt: string | null;
  location: FleetLocation | null;
};
export type FleetDriver = {
  id: string;
  name: string;
  phone: string;
  vehicle: {
    id: string;
    plateNumber: string;
    manufacturer: string | null;
    model: string | null;
    type: "MOTORCYCLE" | "CAR" | "VAN" | "TRUCK";
  } | null;
  tracking: FleetTracking;
};
export type Headquarters = {
  latitude: number;
  longitude: number;
  address: string | null;
  revision: number;
  updatedAt: string;
};
export type FleetSnapshot = {
  companyId: string;
  serverTime: string;
  freshnessSeconds: number;
  headquarters: Headquarters | null;
  drivers: FleetDriver[];
};
export type FleetTrackingEvent = {
  companyId: string;
  driverId: string;
  serverTime: string;
  tracking: FleetTracking;
};
export type FleetHeadquartersEvent = {
  companyId: string;
  headquarters: Headquarters;
};
export type FleetEvent =
  | { name: "fleet:location-updated" | "fleet:driver-status-changed"; data: FleetTrackingEvent }
  | { name: "fleet:headquarters-updated"; data: FleetHeadquartersEvent };
export type FleetScope = { userId: string; companyId: string };
export type HeadquartersInput = {
  latitude: number;
  longitude: number;
  address: string | null;
  expectedRevision: number;
};
export type FleetOperation =
  | { kind: "snapshot" }
  | { kind: "headquarters" }
  | { kind: "save-headquarters"; input: HeadquartersInput }
  | { kind: "ticket" };
export type FleetFailure =
  | "invalid"
  | "unauthenticated"
  | "forbidden"
  | "changed"
  | "unavailable"
  | "conflict"
  | "uncertain";
export type FleetResult =
  | { status: "snapshot"; data: FleetSnapshot }
  | { status: "headquarters"; data: { companyId: string; headquarters: Headquarters | null } }
  | { status: "ticket"; data: { companyId: string; ticket: string; expiresAt: string; endpoint: string } }
  | { status: FleetFailure };
export type FleetConnection = "connecting" | "connected" | "reconnecting" | "disconnected";
