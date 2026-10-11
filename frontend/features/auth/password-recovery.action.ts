"use server";

import { redirect } from "next/navigation";
import type { ForgotPasswordState, PasswordRecoveryField, ResetPasswordState } from "./password-recovery.types";

const initialRequestError = "We couldn't send a reset link. Please try again later.";
const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validToken = /^[a-f0-9]{64}$/i;

function authEndpoint(path: string): URL | null {
  const baseUrl = process.env.FLEETORA_API_URL;
  if (!baseUrl) return null;
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
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

  const endpoint = authEndpoint("auth/forgot-password");
  if (!endpoint) return { status: "error", message: initialRequestError, email };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) return { status: "success" };
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

  if (password.length < 6 || !/[A-Z]/.test(password)) {
    fieldErrors.password = "Use at least 6 characters, including an uppercase letter.";
  }
  if (password !== confirmPassword) fieldErrors.confirmPassword = "Passwords do not match.";
  if (Object.keys(fieldErrors).length) return { status: "error", fieldErrors };
  if (!validUserId.test(userId) || !validToken.test(token)) {
    return { status: "error", message: "This reset link is invalid or expired. Request a new one to continue." };
  }

  const endpoint = authEndpoint("auth/reset-password");
  if (!endpoint) return { status: "error", message: "We couldn't reset your password. Please try again later." };

  let responseStatus: number;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, token, newPassword: password }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    responseStatus = response.status;
  } catch {
    return { status: "error", message: "We couldn't reset your password. Please try again later." };
  }

  if (responseStatus >= 200 && responseStatus < 300) redirect("/login?password=reset");
  if (responseStatus === 400) {
    return { status: "error", message: "This reset link is invalid or expired. Request a new one to continue." };
  }
  return { status: "error", message: "We couldn't reset your password. Please try again later." };
}
