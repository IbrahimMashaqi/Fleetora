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
import { object } from "@/features/operations/operations-contract";
import type {
  Pickup,
  PickupOperation,
  PickupResult,
  Scope,
} from "./pickups.types";
type Jar = Parameters<typeof setSessionTokens>[0] &
  Parameters<typeof clearSessionCookies>[0] & {
    get(name: string): { value: string } | undefined;
  };
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function parsePickup(value: unknown, companyId: string): Pickup | null {
  if (
    !object(value) ||
    typeof value.id !== "string" ||
    !uuid.test(value.id) ||
    value.companyId !== companyId ||
    typeof value.merchantId !== "string" ||
    !uuid.test(value.merchantId) ||
    !["COMPANY_PICKUP", "WAREHOUSE_DROPOFF"].includes(String(value.method)) ||
    !["REQUESTED", "PROPOSED", "CONFIRMED", "RECEIVED", "CANCELLED"].includes(
      String(value.status),
    ) ||
    typeof value.revision !== "number" ||
    !Number.isInteger(value.revision) ||
    typeof value.pickupAddress !== "string"
  )
    return null;
  const nullable = (key: string) =>
    value[key] == null
      ? null
      : typeof value[key] === "string"
        ? value[key]
        : undefined;
  const fields = [
    "notes",
    "preferredFrom",
    "preferredTo",
    "proposedFrom",
    "proposedTo",
    "confirmedFrom",
    "confirmedTo",
    "workerId",
    "warehouseId",
  ] as const;
  if (fields.some((k) => nullable(k) === undefined)) return null;
  const parcels: NonNullable<Pickup["parcels"]> = [];
  if (value.parcels !== undefined) {
    if (!Array.isArray(value.parcels) || value.parcels.length > 200)
      return null;
    for (const p of value.parcels) {
      if (
        !object(p) ||
        p.companyId !== companyId ||
        p.merchantId !== value.merchantId ||
        typeof p.id !== "string" ||
        !uuid.test(p.id) ||
        typeof p.shipmentId !== "string" ||
        !uuid.test(p.shipmentId) ||
        !["PENDING", "RECEIVED", "MISSING", "DISCREPANT"].includes(
          String(p.receipt),
        ) ||
        !(p.receiptNotes == null || typeof p.receiptNotes === "string")
      )
        return null;
      parcels.push({
        id: p.id,
        shipmentId: p.shipmentId,
        receipt: String(p.receipt),
        receiptNotes:
          typeof p.receiptNotes === "string" ? p.receiptNotes : null,
      });
    }
  }
  // Explicit enum narrowing follows the allowlist checks above.
  const method =
    value.method === "COMPANY_PICKUP" ? "COMPANY_PICKUP" : "WAREHOUSE_DROPOFF";
  const status =
    value.status === "REQUESTED"
      ? "REQUESTED"
      : value.status === "PROPOSED"
        ? "PROPOSED"
        : value.status === "CONFIRMED"
          ? "CONFIRMED"
          : value.status === "RECEIVED"
            ? "RECEIVED"
            : "CANCELLED";
  return {
    id: value.id,
    companyId,
    merchantId: value.merchantId,
    method,
    status,
    revision: value.revision,
    pickupAddress: value.pickupAddress,
    notes: nullable("notes") ?? null,
    preferredFrom: nullable("preferredFrom") ?? null,
    preferredTo: nullable("preferredTo") ?? null,
    proposedFrom: nullable("proposedFrom") ?? null,
    proposedTo: nullable("proposedTo") ?? null,
    confirmedFrom: nullable("confirmedFrom") ?? null,
    confirmedTo: nullable("confirmedTo") ?? null,
    workerId: nullable("workerId") ?? null,
    warehouseId: nullable("warehouseId") ?? null,
    ...(value.parcels !== undefined ? { parcels } : {}),
  };
}
export async function pickupsForSession(
  jar: Jar,
  scope: Scope,
  operation: PickupOperation,
): Promise<PickupResult> {
  if (
    !object(operation) ||
    !["list", "detail", "review", "receipts"].includes(operation.action) ||
    (operation.action !== "list" && !uuid.test(operation.id)) ||
    (operation.action === "list" &&
      (!Number.isInteger(operation.page) ||
        operation.page < 1 ||
        operation.page > 100000))
  )
    return { status: "invalid" };
  const session = await resolveSession({
    access: jar.get(accessCookie)?.value,
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
    session.user.id !== scope?.userId ||
    session.user.orgId !== scope.companyId
  )
    return { status: "changed" };
  const token = session.tokens?.accessToken ?? jar.get(accessCookie)?.value;
  if (!token) return { status: "unauthenticated" };
  const writing =
    operation.action === "review" || operation.action === "receipts";
  const path =
    operation.action === "list"
      ? `/pickups?page=${operation.page}&pageSize=25`
      : `/pickups/${operation.id}${operation.action === "review" ? "/review" : operation.action === "receipts" ? "/receipts" : ""}`;
  const endpoint = getBackendEndpoint(path);
  if (!endpoint) return { status: "unavailable" };
  try {
    const response = await requestBackend(endpoint, {
      method: writing ? "POST" : "GET",
      bearer: token,
      expectedCompany: scope.companyId,
      ...(writing ? { body: operation.input } : {}),
    });
    if (response.status === 401) {
      clearSessionCookies(jar);
      return { status: "unauthenticated" };
    }
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 404) return { status: "not-found" };
    if (response.status === 400) return { status: "invalid" };
    if (response.status === 409) return { status: "conflict" };
    if (!response.ok) return { status: writing ? "uncertain" : "unavailable" };
    const envelope = await readBackendBody(response);
    if (
      !object(envelope) ||
      envelope.success !== true ||
      !object(envelope.data)
    )
      return { status: writing ? "uncertain" : "unavailable" };
    const data = envelope.data;
    if (data.companyId !== scope.companyId) return { status: "changed" };
    if (operation.action === "list") {
      if (
        !Array.isArray(data.items) ||
        data.items.length > 25 ||
        typeof data.hasNext !== "boolean"
      )
        return { status: "unavailable" };
      const items: Pickup[] = [];
      for (const value of data.items) {
        const row = parsePickup(value, scope.companyId);
        if (!row) return { status: "changed" };
        items.push(row);
      }
      return { status: "ready", items, hasNext: data.hasNext };
    }
    const pickup = parsePickup(data.pickup, scope.companyId);
    return pickup && pickup.id === operation.id
      ? { status: "detail", pickup }
      : { status: writing ? "uncertain" : "changed" };
  } catch {
    return { status: writing ? "uncertain" : "unavailable" };
  }
}
