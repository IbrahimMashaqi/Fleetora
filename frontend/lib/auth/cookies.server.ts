import "server-only";
import type { TokenPair } from "./tokens.server";

export const accessCookie = "fleetora_access";
export const refreshCookie = "fleetora_refresh";

type CookieOptions = { httpOnly: true; secure: boolean; sameSite: "lax"; path: "/"; maxAge: number };
type CookieWriter = { set(name: string, value: string, options: CookieOptions): unknown };
type CookieDeleter = { delete(name: string): unknown };

export function setSessionTokens(jar: CookieWriter, tokens: TokenPair) {
  const common = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" } as const;
  jar.set(accessCookie, tokens.accessToken, { ...common, maxAge: 10 * 60 });
  jar.set(refreshCookie, tokens.refreshToken, { ...common, maxAge: 7 * 24 * 60 * 60 });
}

export function clearSessionCookies(jar: CookieDeleter) {
  jar.delete(accessCookie);
  jar.delete(refreshCookie);
}
