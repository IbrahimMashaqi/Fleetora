import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { accessCookie, refreshCookie, clearSessionCookies, setSessionTokens } from "@/lib/auth/cookies.server";
import { resolveSession } from "@/lib/auth/session.server";

export async function handleSession(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return jsonSessionResponse({ message: "Request origin could not be verified." }, 403);
  }
  const session = await resolveSession({ access: request.cookies.get(accessCookie)?.value, refresh: request.cookies.get(refreshCookie)?.value });
  if (session.status === "unauthenticated") {
    const response = jsonSessionResponse({ message: "Please sign in again." }, 401);
    clearSessionCookies(response.cookies);
    return response;
  }
  if (session.status === "refresh-rejected") return jsonSessionResponse({ message: "Session changed. Please retry." }, 409);
  const response = session.status === "ready"
    ? jsonSessionResponse({ user: session.user })
    : jsonSessionResponse({ message: "Session service is unavailable." }, 503);
  if (session.tokens) setSessionTokens(response.cookies, session.tokens);
  return response;
}

function jsonSessionResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
