import "server-only";
import { getBackendEndpoint, readBackendBody, requestBackend } from "@/lib/api/backend.server";
import { accessCookie, clearSessionCookies, refreshCookie, setSessionTokens } from "@/lib/auth/cookies.server";
import { resolveSession } from "@/lib/auth/session.server";
import { parseOverviewStats, type OverviewResult, type OverviewScope } from "./overview-contract";

type CookieJar = Parameters<typeof setSessionTokens>[0] & Parameters<typeof clearSessionCookies>[0] & {
  get(name: string): { value: string } | undefined;
};

export async function overviewForSession(jar: CookieJar, expected: OverviewScope): Promise<OverviewResult> {
  const access = jar.get(accessCookie)?.value;
  const session = await resolveSession({ access, refresh: jar.get(refreshCookie)?.value });
  if (session.status === "unauthenticated") {
    clearSessionCookies(jar);
    return { status: "unauthenticated" };
  }
  if (session.status === "refresh-rejected") return { status: "changed" };
  if (session.tokens) setSessionTokens(jar, session.tokens);
  if (session.status !== "ready") return { status: "unavailable" };
  if ((session.user.role !== "COMPANY_ADMIN" && session.user.role !== "ACCOUNTANT") || !session.user.company)
    return { status: "forbidden" };
  const companyId = session.user.company.id;
  if (!expected || expected.userId !== session.user.id || expected.companyId !== companyId)
    return { status: "changed" };
  const bearer = session.tokens?.accessToken ?? access;
  if (!bearer) return { status: "unavailable" };
  try {
    const endpoint = getBackendEndpoint("dashboard/overview");
    if (!endpoint) return { status: "unavailable" };
    const response = await requestBackend(endpoint, { method: "GET", bearer, expectedCompany: companyId });
    if (response.status === 401) {
      clearSessionCookies(jar);
      return { status: "unauthenticated" };
    }
    if (response.status === 403) return { status: "forbidden" };
    if (!response.ok) return { status: "unavailable" };
    const envelope = await readBackendBody(response);
    if (!envelope || typeof envelope !== "object" || !("success" in envelope) || envelope.success !== true ||
      !("data" in envelope) || !envelope.data || typeof envelope.data !== "object" || !("companyId" in envelope.data))
      return { status: "unavailable" };
    if (envelope.data.companyId !== companyId) return { status: "changed" };
    const data = parseOverviewStats(envelope.data, companyId);
    return data ? { status: "ready", data } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
