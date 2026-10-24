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
import {
  confirmedPricingMutation,
  parsePricingData,
  preparePricingOperation,
  type PricingOperation,
  type PricingResult,
  type Scope,
} from "./pricing-contract";
type Jar = Parameters<typeof setSessionTokens>[0] &
  Parameters<typeof clearSessionCookies>[0] & {
    get(name: string): { value: string } | undefined;
  };

export async function pricingForSession(
  jar: Jar,
  scope: Scope,
  operation: PricingOperation,
): Promise<PricingResult> {
  const prepared = preparePricingOperation(operation);
  if (!prepared) return { status: "invalid" };
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
    !scope ||
    session.user.id !== scope.userId ||
    session.user.orgId !== scope.companyId
  )
    return { status: "changed" };
  const bearer = session.tokens?.accessToken ?? access;
  if (!bearer) return { status: "unavailable" };
  const writing = prepared.method !== "GET";
  let dispatched = false;
  try {
    const endpoint = getBackendEndpoint(prepared.path);
    if (!endpoint) return { status: "unavailable" };
    dispatched = true;
    const response = await requestBackend(endpoint, {
      method: prepared.method,
      bearer,
      expectedCompany: scope.companyId,
      ...(prepared.body !== undefined ? { body: prepared.body } : {}),
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
    if (writing)
      return {
        status: confirmedPricingMutation(
          operation,
          envelope.data,
          scope.companyId,
        )
          ? "saved"
          : "uncertain",
      };
    const data = parsePricingData(operation, envelope.data, scope.companyId);
    return data ? { status: "ready", data } : { status: "unavailable" };
  } catch {
    return { status: writing && dispatched ? "uncertain" : "unavailable" };
  }
}
