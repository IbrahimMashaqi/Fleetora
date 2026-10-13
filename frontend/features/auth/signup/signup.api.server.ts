import "server-only";
import { getBackendEndpoint, requestBackend } from "@/lib/api/backend.server";
import type { SignupInput, SignupState } from "./signup.types";

export async function signup(input: SignupInput): Promise<SignupState> {
  try {
    const endpoint = getBackendEndpoint("auth/signup");
    if (!endpoint) {
      return { status: "error", message: "Signup is temporarily unavailable. Please try again later." };
    }
    const response = await requestBackend(endpoint, { method: "POST", body: input });
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
