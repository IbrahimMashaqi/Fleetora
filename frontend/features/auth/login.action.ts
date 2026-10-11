"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { LoginState } from "./login.types";

const accessCookie = "fleetora_access";
const refreshCookie = "fleetora_refresh";

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const email = typeof emailValue === "string" ? emailValue.trim() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const errors: { email?: string; password?: string } = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (password.length < 6) errors.password = "Enter your password (at least 6 characters).";
  if (Object.keys(errors).length) return { status: "error", fieldErrors: errors, values: { email } };

  const baseUrl = process.env.FLEETORA_API_URL;
  if (!baseUrl) return { status: "error", message: "Sign in is temporarily unavailable. Please try again later.", values: { email } };
  try {
    const response = await fetch(new URL("auth/signin", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      const unverified = response.status === 403;
      return { status: "error", message: unverified ? "Please verify your email before signing in. Check your inbox for the verification email." : "We couldn't sign you in with those details. Check your email and password and try again.", values: { email } };
    }
    if (!isAuthResponse(result)) return { status: "error", message: "We couldn't confirm your sign in. Please try again.", values: { email } };
    const jar = await cookies();
    const secure = process.env.NODE_ENV === "production";
    const common = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
    jar.set(accessCookie, result.data.accessToken, { ...common, maxAge: 10 * 60 });
    jar.set(refreshCookie, result.data.refreshToken, { ...common, maxAge: 7 * 24 * 60 * 60 });
  } catch {
    return { status: "error", message: "We couldn't reach Fleetora. Check your connection and try again.", values: { email } };
  }
  redirect("/app");
}


export async function logoutAction() {
  const jar = await cookies();
  const access = jar.get(accessCookie)?.value;
  const refresh = jar.get(refreshCookie)?.value;
  const baseUrl = process.env.FLEETORA_API_URL;
  let revocationConfirmed = !access && !refresh;
  try {
    if (baseUrl) {
      const api = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
      let needsRefresh = !access;
      if (access) {
        const logoutResponse = await fetch(new URL("auth/logout", api), {
          method: "POST", headers: { Authorization: `Bearer ${access}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
        });
        revocationConfirmed = logoutResponse.ok;
        needsRefresh = logoutResponse.status === 401;
      }
      if (needsRefresh && refresh) {
        const response = await fetch(new URL("auth/refresh", api), {
          method: "POST", headers: { Authorization: `Bearer ${refresh}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
        });
        const result: unknown = await response.json();
        if (response.ok && isAuthResponse(result)) {
          const logoutResponse = await fetch(new URL("auth/logout", api), {
            method: "POST", headers: { Authorization: `Bearer ${result.data.accessToken}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
          });
          revocationConfirmed = logoutResponse.ok;
        } else {
          revocationConfirmed = false;
        }
      }
    }
  } catch {
    revocationConfirmed = false;
  }
  jar.delete(accessCookie);
  jar.delete(refreshCookie);
  redirect(revocationConfirmed ? "/login" : "/login?logout=unconfirmed");
}

function isAuthResponse(value: unknown): value is { success: true; data: { accessToken: string; refreshToken: string } } {
  if (!value || typeof value !== "object" || !("success" in value) || value.success !== true || !("data" in value) || !value.data || typeof value.data !== "object") return false;
  return "accessToken" in value.data && typeof value.data.accessToken === "string" && "refreshToken" in value.data && typeof value.data.refreshToken === "string";
}
