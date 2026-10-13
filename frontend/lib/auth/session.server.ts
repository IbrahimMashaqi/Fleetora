import "server-only";
import { getBackendEndpoint, requestBackend, readBackendBody } from "@/lib/api/backend.server";
import { parseTokenPair, type TokenPair } from "./tokens.server";
import { isSessionUser, type SessionUser } from "./session.types";

type Credentials = { access?: string; refresh?: string };
type SessionResult =
  | { status: "ready"; user: SessionUser; tokens?: TokenPair }
  | { status: "unauthenticated" }
  | { status: "unavailable"; tokens?: TokenPair }
  | { status: "refresh-rejected" };

async function credentialRequest(path: string, bearer: string, method: "GET" | "POST") {
  const endpoint = getBackendEndpoint(path);
  if (!endpoint) throw new Error("Backend unavailable");
  return requestBackend(endpoint, { method, bearer, timeoutMs: 10_000 });
}

async function refreshTokens(refresh: string) {
  const response = await credentialRequest("auth/refresh", refresh, "POST");
  const body = await readBackendBody(response);
  return { response, tokens: parseTokenPair(body) };
}

function publicUser(user: SessionUser): SessionUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role, orgId: user.orgId, company: user.company ? { id: user.company.id, name: user.company.name } : null };
}

export async function resolveSession({ access, refresh }: Credentials): Promise<SessionResult> {
  let tokens: TokenPair | undefined;
  try {
    if (!getBackendEndpoint("auth/session")) return { status: "unavailable" };
    let response: Response | undefined;
    if (access) response = await credentialRequest("auth/session", access, "GET");
    if ((!response || response.status === 401) && refresh) {
      const refreshed = await refreshTokens(refresh);
      if (refreshed.response.status === 401) return { status: "unauthenticated" };
      // 403 cannot distinguish expiration, revocation, and token mismatch.
      // Preserve the legacy retry response without automatically refreshing again.
      if (refreshed.response.status === 403) return { status: "refresh-rejected" };
      if (!refreshed.response.ok || !refreshed.tokens) return { status: "unavailable" };
      tokens = refreshed.tokens;
      response = await credentialRequest("auth/session", tokens.accessToken, "GET");
    }
    if (!response || response.status === 401) return { status: "unauthenticated" };
    if (!response.ok) return { status: "unavailable", tokens };
    const body = await readBackendBody(response);
    if (!body || typeof body !== "object" || !("data" in body) || !isSessionUser(body.data)) return { status: "unavailable", tokens };
    return { status: "ready", user: publicUser(body.data), tokens };
  } catch {
    return { status: "unavailable", tokens };
  }
}

export async function revokeSession({ access, refresh }: Credentials): Promise<boolean> {
  let confirmed = !access && !refresh;
  if (confirmed) return true;
  try {
    if (!getBackendEndpoint("auth/logout")) return confirmed;
    let needsRefresh = !access;
    if (access) {
      const response = await credentialRequest("auth/logout", access, "POST");
      confirmed = response.ok;
      needsRefresh = response.status === 401;
    }
    if (needsRefresh && refresh) {
      const result = await refreshTokens(refresh);
      if (!result.response.ok || !result.tokens) return false;
      const response = await credentialRequest("auth/logout", result.tokens.accessToken, "POST");
      confirmed = response.ok;
    }
  } catch { return false; }
  return confirmed;
}
