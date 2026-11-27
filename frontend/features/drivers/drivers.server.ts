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
import {
  isDriverStatus,
  isValidDriverInput,
  normalizeDriverInput,
  driverPhonePattern,
} from "./drivers.types";
import type {
  Driver,
  DriverQuery,
  DriverRequest,
  DriverResult,
  DriverScope,
  DriverVehicle,
  DriverWrite,
  DriverWriteResult,
  DriverPhoneCheckResult,
} from "./drivers.types";

type SessionCookies = Parameters<typeof setSessionTokens>[0] &
  Parameters<typeof clearSessionCookies>[0] & {
    get(name: string): { value: string } | undefined;
  };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}
function validQuery(query: DriverQuery): boolean {
  return (
    object(query) &&
    typeof query.search === "string" &&
    query.search.length <= 100 &&
    Number.isInteger(query.page) &&
    query.page >= 1 &&
    query.page <= 10000 &&
    Number.isInteger(query.pageSize) &&
    query.pageSize >= 1 &&
    query.pageSize <= 50
  );
}
function parseDriver(value: unknown): Driver | null {
  if (
    !object(value) ||
    typeof value.id !== "string" ||
    !uuid.test(value.id) ||
    typeof value.name !== "string" ||
    typeof value.phone !== "string" ||
    !isDriverStatus(value.status)
  )
    return null;
  // Older backend responses may omit the additive vehicle field during rollout.
  let vehicle: DriverVehicle | null = null;
  if (value.vehicle !== undefined && value.vehicle !== null) {
    const item = value.vehicle;
    if (
      !object(item) ||
      typeof item.id !== "string" ||
      !uuid.test(item.id) ||
      !isVehicleType(item.type) ||
      typeof item.plateNumber !== "string" ||
      (item.manufacturer != null && typeof item.manufacturer !== "string") ||
      (item.model != null && typeof item.model !== "string")
    )
      return null;
    vehicle = {
      id: item.id,
      type: item.type,
      plateNumber: item.plateNumber,
      ...(item.manufacturer === undefined
        ? {}
        : { manufacturer: item.manufacturer }),
      ...(item.model === undefined ? {} : { model: item.model }),
    };
  }
  return {
    id: value.id,
    name: value.name,
    phone: value.phone,
    status: value.status,
    vehicle,
  };
}
function isVehicleType(value: unknown): value is DriverVehicle["type"] {
  return (
    value === "MOTORCYCLE" ||
    value === "CAR" ||
    value === "VAN" ||
    value === "TRUCK"
  );
}

type AuthorizedSession =
  | { status: "ready"; bearer: string; companyId: string }
  | { status: "unauthenticated" | "forbidden" | "changed" | "unavailable" };

export async function authorizeDriverSession(
  jar: SessionCookies,
  expected: DriverScope,
): Promise<AuthorizedSession> {
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
  if (
    !["COMPANY_ADMIN", "OPERATIONS"].includes(session.user.role) ||
    !session.user.company ||
    !session.user.orgId
  )
    return { status: "forbidden" };
  // Submitted identity is only a stale-context veto. The JWT selects all scope.
  if (
    !expected ||
    session.user.id !== expected.userId ||
    session.user.orgId !== expected.companyId
  )
    return { status: "changed" };
  const bearer = session.tokens?.accessToken ?? access;
  if (!bearer) return { status: "unavailable" };
  return { status: "ready", bearer, companyId: session.user.orgId };
}

export async function checkDriverPhoneForSession(
  jar: SessionCookies,
  expected: DriverScope,
  input: { phone: string; excludeId?: string },
): Promise<DriverPhoneCheckResult> {
  if (
    !object(input) ||
    typeof input.phone !== "string" ||
    input.phone.length > 40 ||
    !driverPhonePattern.test(input.phone) ||
    (input.excludeId !== undefined && !uuid.test(input.excludeId)) ||
    !Object.keys(input).every((key) => ["phone", "excludeId"].includes(key))
  )
    return { status: "invalid" };
  const authorized = await authorizeDriverSession(jar, expected);
  if (authorized.status !== "ready") return authorized;
  try {
    const endpoint = getBackendEndpoint("drivers/phone-check");
    if (!endpoint) return { status: "unavailable" };
    endpoint.searchParams.set("phone", input.phone);
    if (input.excludeId)
      endpoint.searchParams.set("excludeId", input.excludeId);
    const response = await requestBackend(endpoint, {
      method: "GET",
      bearer: authorized.bearer,
    });
    if (response.status === 401) {
      clearSessionCookies(jar);
      return { status: "unauthenticated" };
    }
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 400) return { status: "invalid" };
    if (response.status === 404) return { status: "not-found" };
    if (!response.ok) return { status: "unavailable" };
    const body = await readBackendBody(response);
    if (!object(body) || body.success !== true || !object(body.data))
      return { status: "unavailable" };
    if (body.data.companyId !== authorized.companyId)
      return { status: "changed" };
    return typeof body.data.duplicate === "boolean"
      ? { status: "ready", duplicate: body.data.duplicate }
      : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function readDriversForSession(
  jar: SessionCookies,
  expected: DriverScope,
  request: DriverRequest,
): Promise<DriverResult> {
  if (
    !object(request) ||
    (request.kind !== "list" && request.kind !== "detail")
  )
    return { status: "invalid" };
  if (
    request.kind === "list"
      ? !validQuery(request.query)
      : typeof request.id !== "string" || !uuid.test(request.id)
  )
    return { status: "invalid" };
  const authorized = await authorizeDriverSession(jar, expected);
  if (authorized.status !== "ready") return authorized;
  const { bearer, companyId } = authorized;
  try {
    const path =
      request.kind === "detail" ? `drivers/${request.id}` : "drivers";
    const endpoint = getBackendEndpoint(path);
    if (!endpoint) return { status: "unavailable" };
    if (request.kind === "list") {
      endpoint.searchParams.set("page", String(request.query.page));
      endpoint.searchParams.set("pageSize", String(request.query.pageSize));
      if (request.query.search.trim())
        endpoint.searchParams.set("search", request.query.search.trim());
    }
    const response = await requestBackend(endpoint, { method: "GET", bearer });
    if (response.status === 401) {
      clearSessionCookies(jar);
      return { status: "unauthenticated" };
    }
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 400) return { status: "invalid" };
    if (response.status === 404 && request.kind === "detail")
      return { status: "not-found" };
    if (!response.ok) return { status: "unavailable" };
    const body = await readBackendBody(response);
    if (!object(body) || body.success !== true)
      return { status: "unavailable" };
    const data = body.data;
    if (!object(data) || typeof data.companyId !== "string" || !data.companyId)
      return { status: "unavailable" };
    if (data.companyId !== companyId) return { status: "changed" };
    if (request.kind === "detail") {
      const parsed = parseDriver(data.driver);
      return parsed && parsed.id === request.id
        ? { status: "detail", data: parsed }
        : { status: "unavailable" };
    }
    if (
      !Array.isArray(data.items) ||
      data.items.length > request.query.pageSize ||
      data.page !== request.query.page ||
      data.pageSize !== request.query.pageSize ||
      typeof data.hasNext !== "boolean"
    )
      return { status: "unavailable" };
    const items: Driver[] = [];
    for (const item of data.items) {
      const parsed = parseDriver(item);
      if (!parsed) return { status: "unavailable" };
      items.push(parsed);
    }
    return {
      status: "list",
      data: {
        items,
        page: request.query.page,
        pageSize: request.query.pageSize,
        hasNext: data.hasNext,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

function validWrite(operation: DriverWrite): DriverWrite | null {
  if (!object(operation)) return null;
  if (operation.kind === "create" || operation.kind === "edit") {
    if (
      !object(operation.input) ||
      typeof operation.input.name !== "string" ||
      typeof operation.input.phone !== "string"
    )
      return null;
    const input = normalizeDriverInput(operation.input);
    if (!isValidDriverInput(input)) return null;
    if (operation.kind === "create") return { kind: "create", input };
    return typeof operation.id === "string" && uuid.test(operation.id)
      ? { kind: "edit", id: operation.id, input }
      : null;
  }
  if (
    operation.kind === "suspension" &&
    typeof operation.id === "string" &&
    uuid.test(operation.id) &&
    typeof operation.suspended === "boolean" &&
    (!operation.suspended || (typeof operation.reason === 'string' && operation.reason.trim().length > 0)) &&
    (operation.reason === undefined || (typeof operation.reason === 'string' && operation.reason.trim().length > 0 && operation.reason.length <= 500))
  )
    return {
      kind: "suspension",
      id: operation.id,
      suspended: operation.suspended,
      ...(operation.reason !== undefined ? { reason: operation.reason.trim() } : {}),
    };
  return null;
}

export async function writeDriverForSession(
  jar: SessionCookies,
  expected: DriverScope,
  submitted: DriverWrite,
): Promise<DriverWriteResult> {
  const operation = validWrite(submitted);
  if (!operation) return { status: "invalid" };
  const authorized = await authorizeDriverSession(jar, expected);
  if (authorized.status !== "ready") return authorized;
  const { bearer, companyId } = authorized;
  let dispatched = false;
  try {
    const endpoint = getBackendEndpoint(
      operation.kind === "create"
        ? "drivers"
        : operation.kind === "edit"
          ? `drivers/${operation.id}`
          : `drivers/${operation.id}/suspension`,
    );
    if (!endpoint) return { status: "unavailable" };
    dispatched = true;
    const response = await requestBackend(endpoint, {
      method:
        operation.kind === "create"
          ? "POST"
          : operation.kind === "edit"
            ? "PATCH"
            : "PUT",
      body:
        operation.kind === "suspension"
          ? { suspended: operation.suspended, ...(operation.reason !== undefined ? { reason: operation.reason } : {}) }
          : { name: operation.input.name, phone: operation.input.phone },
      bearer,
      expectedCompany: companyId,
    });
    if (response.status === 401) {
      clearSessionCookies(jar);
      return { status: "unauthenticated" };
    }
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 400) return { status: "invalid" };
    if (response.status === 404 && operation.kind !== "create")
      return { status: "not-found" };
    if (response.status === 409) return { status: "conflict" };
    if (!response.ok) return { status: "uncertain" };
    const body = await readBackendBody(response);
    if (!object(body) || body.success !== true || !object(body.data))
      return { status: "uncertain" };
    if (body.data.companyId !== companyId) return { status: "changed" };
    const driver = parseDriver(body.data.driver);
    if (!driver || (operation.kind !== "create" && driver.id !== operation.id))
      return { status: "uncertain" };
    return { status: "saved", data: driver };
  } catch {
    return { status: dispatched ? "uncertain" : "unavailable" };
  }
}
