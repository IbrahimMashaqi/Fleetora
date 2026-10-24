import "server-only";
import {
  getBackendEndpoint,
  readBackendBody,
  requestBackend,
} from "./backend.server";
import {
  accessCookie,
  refreshCookie,
  clearSessionCookies,
  setSessionTokens,
} from "@/lib/auth/cookies.server";
import { resolveSession } from "@/lib/auth/session.server";
export type CompanyScope = { userId: string; companyId: string };
export type CompanyJar = Parameters<typeof setSessionTokens>[0] &
  Parameters<typeof clearSessionCookies>[0] & {
    get(name: string): { value: string } | undefined;
  };
export type CompanyFailure =
  | "unauthenticated"
  | "changed"
  | "forbidden"
  | "invalid"
  | "not-found"
  | "conflict"
  | "unavailable"
  | "uncertain";
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Internal transport boundary; feature adapters construct allowlisted paths and payloads. */
export async function companyRequest(
  jar: CompanyJar,
  scope: CompanyScope,
  request: {
    path: string;
    method: "GET" | "POST";
    body?: object;
    accountant?: boolean;
  },
): Promise<
  { status: "data"; data: Record<string, unknown> } | { status: CompanyFailure }
> {
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
    !session.user.company ||
    !(
      session.user.role === "COMPANY_ADMIN" ||
      (request.accountant && session.user.role === "ACCOUNTANT")
    )
  )
    return { status: "forbidden" };
  if (
    session.user.id !== scope?.userId ||
    session.user.orgId !== scope.companyId
  )
    return { status: "changed" };
  const bearer = session.tokens?.accessToken ?? access,
    endpoint = getBackendEndpoint(request.path);
  if (!bearer || !endpoint) return { status: "unavailable" };
  try {
    const response = await requestBackend(endpoint, {
      method: request.method,
      bearer,
      expectedCompany: scope.companyId,
      ...(request.body ? { body: request.body } : {}),
    });
    if (response.status === 401) {
      clearSessionCookies(jar);
      return { status: "unauthenticated" };
    }
    if (response.status === 400) return { status: "invalid" };
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 404) return { status: "not-found" };
    if (response.status === 409) return { status: "conflict" };
    if (!response.ok)
      return {
        status: request.method === "POST" ? "uncertain" : "unavailable",
      };
    const envelope = await readBackendBody(response);
    if (
      !record(envelope) ||
      envelope.success !== true ||
      !record(envelope.data)
    )
      return {
        status: request.method === "POST" ? "uncertain" : "unavailable",
      };
    if (envelope.data.companyId !== scope.companyId)
      return { status: "changed" };
    return { status: "data", data: envelope.data };
  } catch {
    return { status: request.method === "POST" ? "uncertain" : "unavailable" };
  }
}
