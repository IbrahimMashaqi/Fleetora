export const driverStatusLabels = {
  ACTIVE: "Active",
  OFFLINE: "Offline",
  ON_BREAK: "On break",
  SUSPENDED: "Suspended",
};
export type DriverStatus = keyof typeof driverStatusLabels;
export function isDriverStatus(value: unknown): value is DriverStatus {
  return (
    value === "ACTIVE" ||
    value === "OFFLINE" ||
    value === "ON_BREAK" ||
    value === "SUSPENDED"
  );
}
export type Driver = {
  id: string;
  name: string;
  phone: string;
  status: DriverStatus;
  vehicle: DriverVehicle | null;
};
export type DriverVehicle = {
  manufacturer?: string | null;
  model?: string | null;
  id: string;
  type: "MOTORCYCLE" | "CAR" | "VAN" | "TRUCK";
  plateNumber: string;
};
export type DriverQuery = { search: string; page: number; pageSize: number };
export type DriverPage = {
  items: Driver[];
  page: number;
  pageSize: number;
  hasNext: boolean;
};
export type DriverScope = { userId: string; companyId: string };
export type DriverRequest =
  { kind: "list"; query: DriverQuery } | { kind: "detail"; id: string };
export type DriverResult =
  | { status: "list"; data: DriverPage }
  | { status: "detail"; data: Driver }
  | {
      status:
        | "unauthenticated"
        | "forbidden"
        | "changed"
        | "invalid"
        | "not-found"
        | "unavailable";
    };
