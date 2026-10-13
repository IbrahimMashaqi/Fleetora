"use server";

import { signup } from "./signup.api.server";
import type { SignupField, SignupState } from "./signup.types";
import { newPasswordError } from "@/lib/auth/password-policy";

export async function signupAction(
  _previousState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const nameValue = formData.get("name");
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  const email = typeof emailValue === "string" ? emailValue.trim() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const fieldErrors: Partial<Record<SignupField, string>> = {};

  if (name.length < 2) fieldErrors.name = "Enter your name using at least 2 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Enter a valid email address.";
  const passwordError = newPasswordError(password);
  if (passwordError) fieldErrors.password = passwordError;

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors, values: { name, email } };
  }

  const result = await signup({ name, email, password });
  return result.status === "error" ? { ...result, values: { name, email } } : result;
}
