import { NextRequest, NextResponse } from "next/server";
import { isSessionUser, type SessionUser } from "./login.types";

const accessCookie = "fleetora_access";
const refreshCookie = "fleetora_refresh";

export async function handleSession(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return jsonSessionResponse({ message: "Request origin could not be verified." }, 403);
  }
  const baseUrl = process.env.FLEETORA_API_URL;
  if (!baseUrl) return jsonSessionResponse({ message: "Session unavailable." }, 503);
  const api = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  let access = request.cookies.get(accessCookie)?.value;
  const refresh = request.cookies.get(refreshCookie)?.value;
  let response: Response | undefined;
  try {
    if (access) response = await fetch(new URL("auth/session", api), { headers: { Authorization: `Bearer ${access}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
    if ((!response || response.status === 401) && refresh) {
      const refreshed = await fetch(new URL("auth/refresh", api), { method: "POST", headers: { Authorization: `Bearer ${refresh}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
      const envelope: unknown = await refreshed.json();
      if (!refreshed.ok || !isAuthResponse(envelope)) {
        if (refreshed.status === 403) {
          // A competing request may already have rotated this refresh token.
          // Leave cookies untouched so this stale response cannot erase the winner.
          return jsonSessionResponse({ message: "Session changed. Please retry." }, 409);
        }
        if (refreshed.status >= 500) return jsonSessionResponse({ message: "Session service is unavailable." }, 503);
        return clearSession();
      }
      access = envelope.data.accessToken;
      response = await fetch(new URL("auth/session", api), { headers: { Authorization: `Bearer ${access}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
      if (!response.ok) return clearSession();
      const session = await response.json() as { data?: unknown };
      if (!isSessionUser(session.data)) return clearSession();
      const result = jsonSessionResponse({ user: toPublicSessionUser(session.data) });
      setTokens(result, access, envelope.data.refreshToken);
      return result;
    }
    if (!response?.ok) return clearSession();
    const session = await response.json() as { data?: unknown };
    if (!isSessionUser(session.data)) return clearSession();
    return jsonSessionResponse({ user: toPublicSessionUser(session.data) });
  } catch {
    return jsonSessionResponse({ message: "Session service is unavailable." }, 503);
  }

  function clearSession() {
    const result = jsonSessionResponse({ message: "Please sign in again." }, 401);
    result.cookies.delete(accessCookie);
    result.cookies.delete(refreshCookie);
    return result;
  }
}

function jsonSessionResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function toPublicSessionUser(user: SessionUser): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    orgId: user.orgId,
    company: user.company,
  };
}

function setTokens(response: NextResponse, access: string, refresh: string) {
  const common = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  response.cookies.set(accessCookie, access, { ...common, maxAge: 10 * 60 });
  response.cookies.set(refreshCookie, refresh, { ...common, maxAge: 7 * 24 * 60 * 60 });
}

function isAuthResponse(value: unknown): value is { success: true; data: { accessToken: string; refreshToken: string } } {
  if (!value || typeof value !== "object" || !("success" in value) || value.success !== true || !("data" in value) || !value.data || typeof value.data !== "object") return false;
  return "accessToken" in value.data && typeof value.data.accessToken === "string" && "refreshToken" in value.data && typeof value.data.refreshToken === "string";
}
