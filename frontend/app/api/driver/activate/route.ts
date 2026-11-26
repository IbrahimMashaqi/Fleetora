import { NextRequest, NextResponse } from "next/server";
import {
  getBackendEndpoint,
  readBackendBody,
  requestBackend,
} from "@/lib/api/backend.server";
import { clientSourceFor } from "@/lib/api/client-source.server";
import { newPasswordError } from "@/lib/auth/password-policy";
import { object } from "@/features/operations/operations-contract";

// A Route Handler keeps the credential/token out of Next's Server Action argument logs.
export async function POST(request: NextRequest) {
  const reply = (status: string, code: number) =>
    NextResponse.json(
      { status },
      { status: code, headers: { "Cache-Control": "no-store" } },
    );
  if (
    request.nextUrl.search ||
    request.headers.get("origin") !== request.nextUrl.origin ||
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
      typeof input.password !== "string" ||
      newPasswordError(input.password)
    )
      return reply("invalid", 400);
    const endpoint = getBackendEndpoint("driver/invitations/accept");
    if (!endpoint) return reply("unavailable", 503);
    const response = await requestBackend(endpoint, {
      method: "POST",
      body: { token: input.token, password: input.password },
      clientSource: await clientSourceFor("POST", endpoint),
    });
    if (response.status === 400 || response.status === 409)
      return reply("invalid", 400);
    if (response.status === 429) return reply("limited", 429);
    if (!response.ok) return reply("unavailable", 503);
    const body = await readBackendBody(response);
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
