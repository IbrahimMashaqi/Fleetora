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
export type DriverInput = { name: string; phone: string };
export type DriverPhoneCheckResult =
  | { status: "ready"; duplicate: boolean }
  | { status: "unauthenticated" | "forbidden" | "changed" | "invalid" | "not-found" | "unavailable" };
export type DriverWrite =
  | { kind: "create"; input: DriverInput }
  | { kind: "edit"; id: string; input: DriverInput }
  | { kind: "suspension"; id: string; suspended: boolean; reason?: string };
export type DriverWriteResult =
  | { status: "saved"; data: Driver }
  | {
      status:
        | "unauthenticated"
        | "forbidden"
        | "changed"
        | "invalid"
        | "not-found"
        | "unavailable"
        | "uncertain"
        | "conflict";
    };
// Mirrors the backend DTO so obvious mistakes are caught before submission.
export const driverPhonePattern = /^\+?[0-9][0-9 ()-]{5,38}[0-9]$/;
export function normalizeDriverInput(input: DriverInput): DriverInput {
  return {
    name: input.name.trim().replace(/\s+/g, " "),
    phone: input.phone.trim().replace(/\s+/g, " "),
  };
}
export function isValidDriverInput(input: DriverInput): boolean {
  return (
    input.name.length >= 2 &&
    input.name.length <= 150 &&
    input.phone.length <= 40 &&
    driverPhonePattern.test(input.phone)
  );
}
