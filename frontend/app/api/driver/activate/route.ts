import { NextRequest, NextResponse } from "next/server";
import {
  getBackendEndpoint,
  readBackendBody,
  requestBackend,
} from "@/lib/api/backend.server";
import { clientSourceFor } from "@/lib/api/client-source.server";
import { newPasswordError } from "@/lib/auth/password-policy";
import { hasSameOrigin } from "@/lib/auth/same-origin.server";
import { object } from "@/features/operations/operations-contract";
import type { DriverActivationFailure } from "@/features/drivers/driver-activation-contract";

// A Route Handler keeps the credential/token out of Next's Server Action argument logs.
export async function POST(request: NextRequest) {
  const reply = (status: DriverActivationFailure | "accepted", code: number) =>
    NextResponse.json(
      { status },
      { status: code, headers: { "Cache-Control": "no-store" } },
    );
  if (!hasSameOrigin(request)) return reply("request-rejected", 403);
  if (
    request.nextUrl.search ||
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    return reply("invalid", 400);
  try {
    const text = await request.text();
    if (text.length > 4096) return reply("invalid", 400);
    const input: unknown = JSON.parse(text);
    if (
      !object(input) ||
      Object.keys(input).some((key) => !["token", "password"].includes(key)) ||
      typeof input.token !== "string" ||
      !/^[a-f0-9]{64}$/.test(input.token) ||
      typeof input.password !== "string"
    )
      return reply("invalid", 400);
    if (newPasswordError(input.password)) return reply("password-rules", 400);
    const endpoint = getBackendEndpoint("driver/invitations/accept");
    if (!endpoint) return reply("unavailable", 503);
    const response = await requestBackend(endpoint, {
      method: "POST",
      body: { token: input.token, password: input.password },
      clientSource: await clientSourceFor("POST", endpoint),
    });
    if (response.status === 429) return reply("limited", 429);
    const body = await readBackendBody(response);
    if (response.status === 400 || response.status === 409) {
      const messages: unknown[] =
        object(body) && Array.isArray(body.message)
          ? body.message
          : object(body)
            ? [body.message]
            : [];
      if (messages.includes("Driver invitation expired"))
        return reply("expired", 400);
      if (messages.includes("Driver invitation already used or revoked"))
        return reply("used-or-revoked", 400);
      if (messages.includes("This phone already has a driver account"))
        return reply("phone-in-use", 409);
      if (
        messages.some(
          (message) =>
            typeof message === "string" && /^password\b/i.test(message),
        )
      )
        return reply("password-rules", 400);
      return reply("invalid", 400);
    }
    if (!response.ok) return reply("unavailable", 503);
    if (
      !object(body) ||
      body.success !== true ||
      !object(body.data) ||
      body.data.accepted !== true
    )
      return reply("unavailable", 503);
    return reply("accepted", 200);
  } catch {
    return reply("unavailable", 503);
  }
}
