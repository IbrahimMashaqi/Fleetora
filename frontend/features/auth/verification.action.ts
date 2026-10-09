"use server";

import type {
  ResendVerificationState,
  VerificationState,
} from "./verification.types";

function getEndpoint(path: string): URL | null {
  const baseUrl = process.env.FLEETORA_API_URL;
  if (!baseUrl) return null;

  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

function getMessage(body: unknown): string {
  if (typeof body !== "object" || body === null || !("message" in body)) {
    return "";
  }

  const message = body.message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) {
    return message
      .filter((item): item is string => typeof item === "string")
      .join(" ");
  }
  return "";
}

function getDataMessage(body: unknown): string {
  if (typeof body !== "object" || body === null || !("data" in body)) {
    return "";
  }

  const data = body.data;
  if (typeof data !== "object" || data === null || !("message" in data)) {
    return "";
  }
  return typeof data.message === "string" ? data.message : "";
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function verifyEmailAction(
  userId: string,
  token: string,
): Promise<VerificationState> {
  if (!userId || !/^[a-f0-9]{64}$/.test(token)) {
    return { status: "invalid" };
  }
  const endpoint = getEndpoint("auth/verify-email");
  if (!endpoint) return { status: "error" };
  endpoint.searchParams.set("userId", userId);
  endpoint.searchParams.set("token", token);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    const body = await readBody(response);
    const message = `${getMessage(body)} ${getDataMessage(body)}`.toLowerCase();

    if (message.includes("already verified")) {
      return { status: "already-verified" };
    }
    if (message.includes("expired")) return { status: "expired" };
    if (
      message.includes("invalid verification") ||
      message.includes("no verification code") ||
      message.includes("user not found")
    ) {
      return { status: "invalid" };
    }
    if (
      response.ok &&
      typeof body === "object" &&
      body !== null &&
      "success" in body &&
      body.success === true &&
      getDataMessage(body).toLowerCase().includes("verified successfully")
    ) {
      return { status: "verified" };
    }
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}

export async function resendVerificationAction(
  userId: string,
): Promise<ResendVerificationState> {
  if (!userId) return { status: "error" };
  const endpoint = getEndpoint("auth/resend-verification");
  if (!endpoint) return { status: "error" };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    const body = await readBody(response);
    const message = `${getMessage(body)} ${getDataMessage(body)}`.toLowerCase();

    if (response.status === 429) {
      const retryAfter = getMessage(body).match(/(\d+)\s+seconds?/i);
      return {
        status: "rate-limited",
        retryAfterSeconds: retryAfter ? Math.max(1, Number(retryAfter[1])) : 60,
      };
    }
    if (message.includes("already verified")) {
      return { status: "already-verified" };
    }
    if (
      response.ok &&
      typeof body === "object" &&
      body !== null &&
      "success" in body &&
      body.success === true &&
      getDataMessage(body).toLowerCase().includes("sent")
    ) {
      return { status: "sent" };
    }
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}
