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
  object,
  operationEndpoint,
  parseData,
  scalar,
  writeFields,
  type Operation,
  type Result,
  type Scope,
} from "./operations-contract";

type Jar = Parameters<typeof setSessionTokens>[0] &
  Parameters<typeof clearSessionCookies>[0] & {
    get(name: string): { value: string } | undefined;
  };
const resources = new Set([
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
]);
const queryFields = new Set([
  "page",
  "pageSize",
  "search",
  "merchantId",
  "workerId",
  "status",
  "city",
  "from",
  "to",
  "currency",
  "active",
  "remitted",
  "sort",
  "direction",
  "reason",
]);
function valid(operation: Operation): boolean {
  if (
    !object(operation) ||
    !resources.has(operation.resource) ||
    !operationEndpoint(operation)
  )
    return false;
  if (
    operation.input !== undefined &&
    (!object(operation.input) ||
      Object.entries(operation.input).length > 40 ||
      !Object.values(operation.input).every(
        (value) =>
          scalar(value) && (typeof value !== "string" || value.length <= 4000),
      ))
  )
    return false;
  if (
    operation.query !== undefined &&
    (!object(operation.query) ||
      !Object.entries(operation.query).every(
        ([key, value]) =>
          queryFields.has(key) &&
          typeof value === "string" &&
          value.length <= 160,
      ))
  )
    return false;
  return true;
}

export async function operationsForSession(
  jar: Jar,
  scope: Scope,
  operation: Operation,
): Promise<Result> {
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
  if (
    !["COMPANY_ADMIN", "ACCOUNTANT"].includes(session.user.role) ||
    !session.user.company
  )
    return { status: "forbidden" };
  if (
    !scope ||
    session.user.id !== scope.userId ||
    session.user.orgId !== scope.companyId
  )
    return { status: "changed" };
  const bearer = session.tokens?.accessToken ?? access;
  if (!bearer) return { status: "unavailable" };
  const writing = Boolean(operation.action && operation.action !== "preview");
  let dispatched = false;
  try {
    const path = operationEndpoint(operation);
    const endpoint = path ? getBackendEndpoint(path) : null;
    if (!endpoint) return { status: "unavailable" };
    for (const [key, value] of Object.entries(operation.query ?? {}))
      if (value) endpoint.searchParams.set(key, value);
    dispatched = true;
    const response = await requestBackend(endpoint, {
      method:
        operation.action === "edit"
          ? "PATCH"
          : operation.action
            ? "POST"
            : "GET",
      bearer,
      expectedCompany: session.user.orgId ?? undefined,
      ...(operation.action ? { body: writeFields(operation) } : {}),
    });
    if (response.status === 401) {
      clearSessionCookies(jar);
      return { status: "unauthenticated" };
    }
    if (response.status === 400) return { status: "invalid" };
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 404) return { status: "not-found" };
    if (response.status === 409) return { status: "conflict" };
    if (!response.ok) return { status: writing ? "uncertain" : "unavailable" };
    const envelope = await readBackendBody(response);
    if (
      !object(envelope) ||
      envelope.success !== true ||
      !object(envelope.data)
    )
      return { status: writing ? "uncertain" : "unavailable" };
    if (envelope.data.companyId !== scope.companyId)
      return { status: "changed" };
    const data = parseData(operation, envelope.data, scope.companyId);
    return data
      ? { status: "ready", data }
      : { status: writing ? "uncertain" : "unavailable" };
  } catch {
    return { status: writing && dispatched ? "uncertain" : "unavailable" };
  }
}
