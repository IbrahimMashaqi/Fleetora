"use server";

import { signup } from "./signup.api.server";
import { COMPANY_CURRENCIES, type CompanyCurrency, type SignupField, type SignupState } from "./signup.types";
import { newPasswordError } from "@/lib/auth/password-policy";

export async function signupAction(
  _previousState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const nameValue = formData.get("name");
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const currencyValue = formData.get("currency");
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  const email = typeof emailValue === "string" ? emailValue.trim() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";
  // An absent field means the default; any sent value must be a supported currency.
  const currency = currencyValue === null ? "ILS" : String(currencyValue);
  const fieldErrors: Partial<Record<SignupField, string>> = {};

  if (name.length < 2) fieldErrors.name = "Enter your name using at least 2 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Enter a valid email address.";
  const passwordError = newPasswordError(password);
  if (passwordError) fieldErrors.password = passwordError;
  if (!isCompanyCurrency(currency)) fieldErrors.currency = "Choose a supported currency.";

  if (Object.keys(fieldErrors).length > 0 || !isCompanyCurrency(currency)) {
    return { status: "error", fieldErrors, values: { name, email, currency } };
  }

  const result = await signup({ name, email, password, currency });
  return result.status === "error" ? { ...result, values: { name, email, currency } } : result;
}

function isCompanyCurrency(value: string): value is CompanyCurrency {
  return (COMPANY_CURRENCIES as readonly string[]).includes(value);
}
