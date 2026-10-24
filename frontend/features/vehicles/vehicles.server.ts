import { parseCatalog } from "./vehicle-catalog";
import "server-only";
import {
  getBackendEndpoint,
  readBackendBody,
  requestBackend,
} from "@/lib/api/backend.server";
import {
  accessCookie,
  refreshCookie,
  clearSessionCookies,
  setSessionTokens,
} from "@/lib/auth/cookies.server";
import { resolveSession } from "@/lib/auth/session.server";
import type {
  FleetOperation,
  FleetResult,
  FleetScope,
  Vehicle,
  VehicleInput,
} from "./vehicles.types";
type Jar = Parameters<typeof setSessionTokens>[0] &
  Parameters<typeof clearSessionCookies>[0] & {
    get(name: string): { value: string } | undefined;
  };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}
function nullableText(value: unknown, max: number): value is string | null {
  return value === null || (typeof value === "string" && value.length <= max);
}
function vehicleType(value: unknown): value is VehicleInput["type"] {
  return ["MOTORCYCLE", "CAR", "VAN", "TRUCK"].includes(
    typeof value === "string" ? value : "",
  );
}
export function validVehicle(value: unknown): value is VehicleInput {
  return (
    object(value) &&
    nullableText(value.manufacturer, 80) &&
    nullableText(value.model, 100) &&
    vehicleType(value.type) &&
    typeof value.plateNumber === "string" &&
    value.plateNumber.trim().length > 0 &&
    value.plateNumber.length <= 32
  );
}
function parse(value: unknown): Vehicle | null {
  if (!object(value) || typeof value.id !== "string" || !uuid.test(value.id))
    return null;
  const id = value.id;
  const assigned = value.assignedDriver;
  // Read legacy plates as stored; the stricter limits apply to new writes.
  if (
    !nullableText(value.manufacturer, 80) ||
    !nullableText(value.model, 100) ||
    !vehicleType(value.type) ||
    typeof value.plateNumber !== "string"
  )
    return null;
  let assignedDriver: Vehicle["assignedDriver"] = null;
  if (assigned !== null) {
    if (
      !object(assigned) ||
      typeof assigned.id !== "string" ||
      !uuid.test(assigned.id) ||
      typeof assigned.name !== "string"
    )
      return null;
    assignedDriver = { id: assigned.id, name: assigned.name };
  }
  return {
    id,
    manufacturer: value.manufacturer,
    model: value.model,
    type: value.type,
    plateNumber: value.plateNumber,
    assignedDriver,
  };
}
function valid(operation: FleetOperation): boolean {
  if (!object(operation)) return false;
  switch (operation.kind) {
    case "create":
      return validVehicle(operation.input);
    case "edit":
      return (
        typeof operation.id === "string" &&
        uuid.test(operation.id) &&
        validVehicle(operation.input)
      );
    case "delete":
      return typeof operation.id === "string" && uuid.test(operation.id);
    case "assign":
      return (
        typeof operation.id === "string" &&
        uuid.test(operation.id) &&
        (operation.vehicleId === null ||
          (typeof operation.vehicleId === "string" &&
            uuid.test(operation.vehicleId))) &&
        (operation.expectedVehicleId === null ||
          (typeof operation.expectedVehicleId === "string" &&
            uuid.test(operation.expectedVehicleId)))
      );
    case "list": {
      const q = operation.query;
      return (
        object(q) &&
        typeof q.search === "string" &&
        q.search.length <= 100 &&
        Number.isInteger(q.page) &&
        q.page >= 1 &&
        q.page <= 10000 &&
        Number.isInteger(q.pageSize) &&
        q.pageSize >= 1 &&
        q.pageSize <= 50 &&
        (operation.unassigned === undefined ||
          typeof operation.unassigned === "boolean")
      );
    }
    default:
      return false;
  }
}
export async function fleetForSession(
  jar: Jar,
  expected: FleetScope,
  operation: FleetOperation,
): Promise<FleetResult> {
  if (!valid(operation)) return { status: "invalid" };
  const access = jar.get(accessCookie)?.value;
  const session = await resolveSession({
    access,
    refresh: jar.get(refreshCookie)?.value,
  });
  if (session.status === "unauthenticated") {
    clearSessionCookies(jar);
    return { status: "unauthenticated" };
  }
  if (session.status === "refresh-rejected") return { status: "changed" };
  if (session.tokens) setSessionTokens(jar, session.tokens);
  if (session.status !== "ready") return { status: "unavailable" };
  if (session.user.role !== "COMPANY_ADMIN" || !session.user.company)
    return { status: "forbidden" };
  if (
    !expected ||
    session.user.id !== expected.userId ||
    session.user.orgId !== expected.companyId
  )
    return { status: "changed" };
  const bearer = session.tokens?.accessToken ?? access;
  if (!bearer) return { status: "unavailable" };
  const writing = operation.kind !== "list";
  let dispatched = false;
  try {
    const path =
      operation.kind === "assign"
        ? `drivers/${operation.id}/vehicle`
        : operation.kind === "edit" || operation.kind === "delete"
          ? `vehicles/${operation.id}`
          : "vehicles";
    const endpoint = getBackendEndpoint(path);
    if (!endpoint) return { status: "unavailable" };
    if (operation.kind === "list") {
      endpoint.searchParams.set("page", String(operation.query.page));
      endpoint.searchParams.set("pageSize", String(operation.query.pageSize));
      if (operation.query.search.trim())
        endpoint.searchParams.set("search", operation.query.search.trim());
      if (operation.unassigned) endpoint.searchParams.set("unassigned", "true");
    }
    const method =
      operation.kind === "create"
        ? "POST"
        : operation.kind === "edit"
          ? "PATCH"
          : operation.kind === "assign"
            ? "PUT"
            : operation.kind === "delete"
              ? "DELETE"
              : "GET";
    const body =
      operation.kind === "create" || operation.kind === "edit"
        ? {
            manufacturer: operation.input.manufacturer,
            model: operation.input.model,
            type: operation.input.type,
            plateNumber: operation.input.plateNumber,
          }
        : operation.kind === "assign"
          ? {
              vehicleId: operation.vehicleId,
              expectedVehicleId: operation.expectedVehicleId,
            }
          : undefined;
    dispatched = true;
    const response = await requestBackend(endpoint, {
      method,
      body,
      bearer,
      expectedCompany: writing ? session.user.orgId : undefined,
    });
    if (response.status === 401) {
      clearSessionCookies(jar);
      return { status: "unauthenticated" };
    }
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 400) return { status: "invalid" };
    if (response.status === 404) return { status: "not-found" };
    if (response.status === 409) return { status: "conflict" };
    if (!response.ok) return { status: writing ? "uncertain" : "unavailable" };
    // DELETE's contract is deliberately bodyless. Context was validated before
    // dispatch and pinned by the backend's company/actor transaction locks.
    if (operation.kind === "delete")
      return { status: response.status === 204 ? "saved" : "uncertain" };
    const envelope = await readBackendBody(response);
    if (
      !object(envelope) ||
      envelope.success !== true ||
      !object(envelope.data)
    )
      return { status: writing ? "uncertain" : "unavailable" };
    const data = envelope.data;
    if (data.companyId !== session.user.orgId) return { status: "changed" };
    if (operation.kind === "assign")
      return object(data.driver) && data.driver.id === operation.id
        ? { status: "saved" }
        : { status: "uncertain" };
    if (operation.kind !== "list") {
      const item = parse(data.vehicle);
      return item && (operation.kind !== "edit" || item.id === operation.id)
        ? { status: "saved" }
        : { status: "uncertain" };
    }
    if (
      !Array.isArray(data.items) ||
      data.items.length > operation.query.pageSize ||
      data.page !== operation.query.page ||
      data.pageSize !== operation.query.pageSize ||
      typeof data.hasNext !== "boolean"
    )
      return { status: "unavailable" };
    const catalog = parseCatalog(data.catalog);
    if (!catalog) return { status: "unavailable" };
    const items: Vehicle[] = [];
    for (const value of data.items) {
      const item = parse(value);
      if (!item || (operation.unassigned && item.assignedDriver))
        return { status: "unavailable" };
      items.push(item);
    }
    return {
      status: "list",
      data: {
        items,
        catalog,
        page: operation.query.page,
        pageSize: operation.query.pageSize,
        hasNext: data.hasNext,
      },
    };
  } catch {
    return { status: writing && dispatched ? "uncertain" : "unavailable" };
  }
}
