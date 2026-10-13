"use server";

import { getBackendEndpoint, requestBackend, readBackendBody } from "@/lib/api/backend.server";
import { newPasswordError } from "@/lib/auth/password-policy";

import { redirect } from "next/navigation";
import type { ForgotPasswordState, PasswordRecoveryField, ResetPasswordState } from "./password-recovery.types";

const initialRequestError = "We couldn't send a reset link. Please try again later.";
const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validToken = /^[a-f0-9]{64}$/i;

function hasRecoveryAcknowledgement(body: unknown): boolean {
  return typeof body === "object" && body !== null && "success" in body && body.success === true &&
    "data" in body && typeof body.data === "object" && body.data !== null &&
    "message" in body.data && typeof body.data.message === "string" && body.data.message.trim().length > 0;
}

export async function forgotPasswordAction(
  _previousState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail.trim() : "";
  const fieldErrors: Partial<Record<PasswordRecoveryField, string>> = {};
  if (!validEmail.test(email)) fieldErrors.email = "Enter a valid email address.";
  if (Object.keys(fieldErrors).length) return { status: "error", fieldErrors, email };

  try {
    const endpoint = getBackendEndpoint("auth/forgot-password");
    if (!endpoint) return { status: "error", message: initialRequestError, email };
    const response = await requestBackend(endpoint, { method: "POST", body: { email } });

    if (response.ok && hasRecoveryAcknowledgement(await readBackendBody(response))) return { status: "success" };
    return { status: "error", message: initialRequestError, email };
  } catch {
    return { status: "error", message: initialRequestError, email };
  }
}

export async function resetPasswordAction(
  userId: string,
  token: string,
  _previousState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const passwordValue = formData.get("password");
  const confirmValue = formData.get("confirmPassword");
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const confirmPassword = typeof confirmValue === "string" ? confirmValue : "";
  const fieldErrors: Partial<Record<PasswordRecoveryField, string>> = {};

  const passwordError = newPasswordError(password);
  if (passwordError) fieldErrors.password = passwordError;
  if (password !== confirmPassword) fieldErrors.confirmPassword = "Passwords do not match.";
  if (Object.keys(fieldErrors).length) return { status: "error", fieldErrors };
  if (!validUserId.test(userId) || !validToken.test(token)) {
    return { status: "error", message: "This reset link is invalid or expired. Request a new one to continue." };
  }

  let responseStatus: number;
  try {
    const endpoint = getBackendEndpoint("auth/reset-password");
    if (!endpoint) return { status: "error", message: "We couldn't reset your password. Please try again later." };
    const response = await requestBackend(endpoint, { method: "POST", body: { id: userId, token, newPassword: password } });
    responseStatus = response.status;
    if (response.ok && !hasRecoveryAcknowledgement(await readBackendBody(response))) {
      return { status: "error", message: "We couldn't confirm your password reset. Please try again later." };
    }
  } catch {
    return { status: "error", message: "We couldn't reset your password. Please try again later." };
  }

  if (responseStatus >= 200 && responseStatus < 300) redirect("/login?password=reset");
  if (responseStatus === 400) {
    return { status: "error", message: "This reset link is invalid or expired. Request a new one to continue." };
  }
  return { status: "error", message: "We couldn't reset your password. Please try again later." };
}
