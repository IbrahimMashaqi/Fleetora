import type { VehicleCatalog } from "./vehicle-catalog";
import type {
  DriverScope,
  DriverQuery,
  DriverVehicle,
} from "@/features/drivers/drivers.types";
import type { TranslationKey } from "@/lib/i18n";
export type Vehicle = DriverVehicle & {
  manufacturer: string | null;
  model: string | null;
  assignedDriver: { id: string; name: string } | null;
};
export type VehicleInput = {
  manufacturer: string | null;
  model: string | null;
  type: DriverVehicle["type"];
  plateNumber: string;
};
export type FleetOperation =
  | { kind: "list"; query: DriverQuery; unassigned?: boolean }
  | { kind: "create"; input: VehicleInput }
  | { kind: "edit"; id: string; input: VehicleInput }
  | { kind: "delete"; id: string }
  | {
      kind: "assign";
      id: string;
      vehicleId: string | null;
      expectedVehicleId: string | null;
    };
export type FleetResult =
  | {
      status: "list";
      data: {
        items: Vehicle[];
        catalog?: VehicleCatalog;
        page: number;
        pageSize: number;
        hasNext: boolean;
      };
    }
  | { status: "saved" }
  | {
      status:
        | "invalid"
        | "unavailable"
        | "unauthenticated"
        | "forbidden"
        | "changed"
        | "not-found"
        | "conflict"
        | "uncertain";
    };
export type FleetScope = DriverScope;
export const fleetMessages = {
  invalid: "Check the vehicle fields and try again.",
  unavailable: "Vehicles could not be loaded. Please try again.",
  unauthenticated: "Sign in again to continue.",
  forbidden: "Company administrator access is required.",
  changed: "Your session changed. Reload this page before continuing.",
  "not-found": "The driver or vehicle is no longer available.",
  conflict:
    "This plate or vehicle is already in use, or the assignment changed. Refresh before trying again.",
  uncertain:
    "We could not confirm whether the change was saved. Close this form and refresh to check before submitting again.",
} as const satisfies Record<
  Exclude<FleetResult["status"], "list" | "saved">,
  TranslationKey
>;
