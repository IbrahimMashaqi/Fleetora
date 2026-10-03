import type { SignupInput, SignupState } from "./signup.types";

export async function signup(input: SignupInput): Promise<SignupState> {
  const baseUrl = process.env.FLEETORA_API_URL;
  if (!baseUrl) {
    return { status: "error", message: "Signup is temporarily unavailable. Please try again later." };
  }

  try {
    const response = await fetch(new URL("auth/signup", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    const result: unknown = await response.json();

    if (!response.ok) {
      if (
        (response.status === 400 || response.status === 409) &&
        typeof result === "object" && result !== null &&
        "message" in result && result.message === "Email already in use"
      ) {
        return { status: "error", fieldErrors: { email: "This email is already in use." } };
      }
      return {
        status: "error",
        message: response.status === 400
          ? "Please check your details and try again."
          : "We couldn't create your account. Please try again later.",
      };
    }

    if (
      typeof result !== "object" || result === null ||
      !("success" in result) || result.success !== true ||
      !("data" in result) || typeof result.data !== "object" || result.data === null ||
      !("userId" in result.data) || typeof result.data.userId !== "string" ||
      !("email" in result.data) || typeof result.data.email !== "string"
    ) {
      return { status: "error", message: "We couldn't confirm your signup. Please check your email before trying again." };
    }

    return { status: "success", email: result.data.email };
  } catch {
    return {
      status: "error",
      message: "We couldn't confirm your signup. Check your connection and email before trying again.",
    };
  }
}
