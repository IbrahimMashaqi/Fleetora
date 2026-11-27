import {
  object,
  type Operation,
  type Result,
  type Scope,
} from "@/features/operations/operations-contract";
import type {
  DriverRequest,
  DriverResult,
  DriverPhoneCheckResult,
} from "@/features/drivers/drivers.types";
import type {
  FleetOperation,
  FleetResult,
} from "@/features/vehicles/vehicles.types";
import type {
  MerchantRequest,
  MerchantResult,
} from "@/features/merchants/merchants.types";
import type {
  WarehouseQuery,
  WarehouseResult,
} from "@/features/warehouses/warehouses.types";
import type {
  PricingOperation,
  PricingResult,
} from "@/features/merchant-pricing/pricing-contract";
import type {
  PickupOperation,
  PickupResult,
} from "@/features/pickups/pickups.types";
import type { DriverAccessResult } from "@/features/drivers/driver-access.types";

export type ReadOperations = {
  operations: Omit<Operation, "action" | "input"> & { action?: never; input?: never };
  drivers: DriverRequest;
  vehicles: Extract<FleetOperation, { kind: "list" }>;
  merchants: MerchantRequest;
  warehouses: WarehouseQuery;
  pricing: Extract<PricingOperation, { kind: "zones" | "plans" | "plan" }>;
  pickups: Extract<PickupOperation, { action: "list" | "detail" }>;
  operationalPricing: Extract<PricingOperation, { kind: "quote" }>;
  driverPhone: { phone: string; excludeId?: string };
  driverAccess: { kind: "read"; id: string };
};
export type ReadResults = {
  operations: Result;
  drivers: DriverResult;
  vehicles: FleetResult;
  merchants: MerchantResult;
  warehouses: WarehouseResult;
  pricing: PricingResult;
  pickups: PickupResult;
  operationalPricing: PricingResult;
  driverPhone: DriverPhoneCheckResult;
  driverAccess: DriverAccessResult;
};
export type ReadRequest = {
  [K in keyof ReadOperations]: {
    area: K;
    scope: Scope;
    operation: ReadOperations[K];
  };
}[keyof ReadOperations];
const text = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 160;
const pageQuery = (v: unknown) =>
  object(v) &&
  text(v.search) &&
  typeof v.page === "number" &&
  typeof v.pageSize === "number";
const stringQuery = (v: unknown) =>
  object(v) &&
  Object.entries(v).every(([key, value]) => text(key) && text(value));

/** The transport accepts reads only. Domain validators still check bounds and authority. */
export function isReadRequest(value: unknown): value is ReadRequest {
  if (
    !object(value) ||
    !object(value.scope) ||
    !text(value.scope.userId) ||
    !text(value.scope.companyId) ||
    !object(value.operation)
  )
    return false;
  const q = value.operation;
  if (
    q.input !== undefined ||
    (q.action !== undefined && value.area !== "pickups")
  )
    return false;
  switch (value.area) {
    case "driverAccess": return q.kind === "read" && text(q.id);
    case "operations":
      return (
        [
          "lookups",
          "config",
          "merchants",
          "parcels",
          "returns",
          "collections",
          "settlements",
          "dashboard",
          "drivers",
          "statement",
          "events",
          "adjustments",
        ].includes(String(q.resource)) &&
        (q.id === undefined || text(q.id)) &&
        (q.query === undefined || stringQuery(q.query))
      );
    case "drivers":
    case "merchants":
      return q.kind === "list"
        ? pageQuery(q.query)
        : q.kind === "detail" && text(q.id);
    case "vehicles":
      return (
        q.kind === "list" &&
        pageQuery(q.query) &&
        (q.unassigned === undefined || typeof q.unassigned === "boolean")
      );
    case "warehouses":
      return pageQuery(q) && ["ACTIVE", "ARCHIVED"].includes(String(q.status));
    case "pricing":
      return q.kind === "zones" || q.kind === "plans"
        ? typeof q.page === "number" &&
            (q.search === undefined || text(q.search))
        : q.kind === "plan" && text(q.id);
    case "pickups":
      return q.action === "list"
        ? typeof q.page === "number" &&
            (q.search === undefined || text(q.search))
        : q.action === "detail" && text(q.id);
    case "operationalPricing":
      return (
        q.kind === "quote" &&
        text(q.merchantId) &&
        text(q.zoneId) &&
        text(q.finalCustomerAmount)
      );
    case "driverPhone":
      return text(q.phone) && (q.excludeId === undefined || text(q.excludeId));
    default:
      return false;
  }
}
