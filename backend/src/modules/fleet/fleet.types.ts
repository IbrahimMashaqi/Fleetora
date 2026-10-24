/** Public wire contract. No driver authentication secrets or sharing session IDs. */
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
    type: 'MOTORCYCLE' | 'CAR' | 'VAN' | 'TRUCK';
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
  | {
      name: 'fleet:location-updated' | 'fleet:driver-status-changed';
      data: FleetTrackingEvent;
    }
  | { name: 'fleet:headquarters-updated'; data: FleetHeadquartersEvent };
