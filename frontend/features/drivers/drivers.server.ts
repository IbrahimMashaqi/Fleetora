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
import { isDriverStatus } from "./drivers.types";
import type {
  Driver,
  DriverQuery,
  DriverRequest,
  DriverResult,
  DriverScope,
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
  return {
    id: value.id,
    name: value.name,
    phone: value.phone,
    status: value.status,
  };
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
  // Submitted identity is only a stale-context veto. The JWT selects all scope.
  if (
    !expected ||
    session.user.id !== expected.userId ||
    session.user.orgId !== expected.companyId
  )
    return { status: "changed" };
  const bearer = session.tokens?.accessToken ?? access;
  if (!bearer) return { status: "unavailable" };
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
    if (data.companyId !== session.user.orgId) return { status: "changed" };
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
