"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { LoginState } from "./login.types";
import { getBackendEndpoint, requestBackend, readBackendBody } from "@/lib/api/backend.server";
import { parseTokenPair } from "@/lib/auth/tokens.server";
import { setSessionTokens } from "@/lib/auth/cookies.server";



export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const email = typeof emailValue === "string" ? emailValue.trim() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const errors: { email?: string; password?: string } = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (password.length < 6) errors.password = "Enter your password (at least 6 characters).";
  if (Object.keys(errors).length) return { status: "error", fieldErrors: errors, values: { email } };

  try {
    const endpoint = getBackendEndpoint("auth/signin");
    if (!endpoint) return { status: "error", message: "Sign in is temporarily unavailable. Please try again later.", values: { email } };
    const response = await requestBackend(endpoint, { method: "POST", body: { email, password } });
    if (!response.ok) {
      if (response.status === 429) return { status: "error", message: "Too many sign-in attempts. Please try again later.", values: { email } };
      if (![400, 401, 403].includes(response.status)) return { status: "error", message: "Sign in is temporarily unavailable. Please try again later.", values: { email } };
      const unverified = response.status === 403;
      return { status: "error", message: unverified ? "Please verify your email before signing in. Check your inbox for the verification email." : "We couldn't sign you in with those details. Check your email and password and try again.", values: { email } };
    }
    const result = await readBackendBody(response);
    const tokens = parseTokenPair(result);
    if (!tokens) return { status: "error", message: "We couldn't confirm your sign in. Please try again.", values: { email } };
    const jar = await cookies();
    setSessionTokens(jar, tokens);
  } catch {
    return { status: "error", message: "We couldn't reach Fleetora. Check your connection and try again.", values: { email } };
  }
  redirect("/app");
}
