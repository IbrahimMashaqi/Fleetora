import "server-only";

import { getBackendEndpoint, readBackendBody, requestBackend } from "@/lib/api/backend.server";
import { accessCookie, refreshCookie, clearSessionCookies, setSessionTokens } from "@/lib/auth/cookies.server";
import { newPasswordError } from "@/lib/auth/password-policy";
import { resolveSession } from "@/lib/auth/session.server";
import type { PasswordChangeField, PasswordChangeState } from "./password-change.types";

// A narrow cookie boundary lets isolated tests exercise the real session/API flow.
type SessionCookies = Parameters<typeof setSessionTokens>[0]
  & Parameters<typeof clearSessionCookies>[0]
  & { get(name: string): { value: string } | undefined };

const unavailable: PasswordChangeState = { status: "error", message: "Password changes are temporarily unavailable. Please try again later." };
const changed: PasswordChangeState = { status: "session-changed", message: "Your session changed. Reload your account before trying again." };
const uncertain: PasswordChangeState = { status: "uncertain", message: "We couldn't confirm whether your password changed. Try signing in with your new password before submitting another change." };

function acknowledged(body: unknown): boolean {
  if (!body || typeof body !== "object" || !("success" in body) || body.success !== true || !("data" in body)) return false;
  const data = body.data;
  return !!data && typeof data === "object" && "success" in data && data.success === true
    && "message" in data && typeof data.message === "string" && data.message.trim().length > 0;
}

export async function changePasswordForSession(
  jar: SessionCookies,
  expectedUserId: string,
  formData: FormData,
): Promise<PasswordChangeState> {
  const value = (name: PasswordChangeField) => {
    const field = formData.get(name);
    return typeof field === "string" ? field : "";
  };
  const oldPassword = value("oldPassword");
  const newPassword = value("newPassword");
  const fieldErrors: Partial<Record<PasswordChangeField, string>> = {};
  if (!oldPassword) fieldErrors.oldPassword = "Enter your current password.";
  const policyError = newPasswordError(newPassword);
  if (policyError) fieldErrors.newPassword = policyError;
  if (value("confirmPassword") !== newPassword) fieldErrors.confirmPassword = "Passwords do not match.";
  if (Object.keys(fieldErrors).length) return { status: "error", fieldErrors };

  // Configuration/session failure occurs before mutation, so it is safe to retry.
  let endpoint: URL;
  try {
    const configuredEndpoint = getBackendEndpoint("auth/update-password");
    if (!configuredEndpoint) return unavailable;
    endpoint = configuredEndpoint;
  } catch { return unavailable; }

  const access = jar.get(accessCookie)?.value;
  const session = await resolveSession({ access, refresh: jar.get(refreshCookie)?.value });
  if (session.status === "unauthenticated") {
    clearSessionCookies(jar);
    return { status: "unauthenticated" };
  }
  if (session.status === "refresh-rejected") return changed;
  if (session.tokens) setSessionTokens(jar, session.tokens);
  if (session.status !== "ready") return unavailable;

  // Client context can only veto a stale form. Cookie-validated identity and the
  // backend bearer token select the subject; this value never selects a user.
  if (typeof expectedUserId !== "string" || expectedUserId !== session.user.id) return changed;
  const bearer = session.tokens?.accessToken ?? access;
  if (!bearer) return unavailable;

  // Never replay this request: an interrupted/invalid response may follow a commit.
  try {
    const response = await requestBackend(endpoint, { method: "POST", bearer, body: { oldPassword, newPassword } });
    if (response.status === 401) {
      clearSessionCookies(jar);
      return { status: "unauthenticated" };
    }
    if (response.status === 403) return { status: "error", message: "Your session could not authorize this change. Sign in again to continue." };
    if (response.status === 429) return { status: "error", message: "Too many attempts. Please wait before trying again." };
    if (response.status === 400) {
      const body = await readBackendBody(response);
      if (body && typeof body === "object" && "message" in body && body.message === "Last password is incorrect") {
        return { status: "error", fieldErrors: { oldPassword: "Your current password is incorrect." } };
      }
      return { status: "error", message: "We couldn't accept that password change. Check your current password and the new password requirements." };
    }
    if (response.status === 200 && acknowledged(await readBackendBody(response))) {
      return { status: "success", message: "Your password has been changed." };
    }
    return uncertain;
  } catch { return uncertain; }
}
