import { NextRequest, NextResponse } from "next/server";
import { hasSameOrigin } from "@/lib/auth/same-origin.server";
import {
  getBackendEndpoint,
  requestBackend,
  readBackendBody,
} from "@/lib/api/backend.server";
import { clientSourceFor } from "@/lib/api/client-source.server";
import { newPasswordError } from "@/lib/auth/password-policy";
import { record } from "@/features/platform/platform-contract";
export async function handleActivation(
  request: NextRequest,
  kind: "platform" | "company",
) {
  const reply = (status: string, code: number) =>
    NextResponse.json(
      { status },
      { status: code, headers: { "Cache-Control": "no-store" } },
    );
  if (!hasSameOrigin(request)) return reply("forbidden", 403);
  if (request.nextUrl.search) return reply("invalid", 400);
  try {
    const text = await request.text();
    if (text.length > 4096) return reply("invalid", 400);
    const input: unknown = JSON.parse(text);
    if (
      !record(input) ||
      typeof input.token !== "string" ||
      !/^[a-f0-9]{64}$/.test(input.token) ||
      typeof input.name !== "string" ||
      input.name.trim().length < 2 ||
      input.name.trim().length > 120 ||
      typeof input.password !== "string"
    )
      return reply("invalid", 400);
    if (newPasswordError(input.password)) return reply("password-rules", 400);
    const endpoint = getBackendEndpoint(
      kind === "company"
        ? "company/admin-invitations/accept"
        : "platform/invitations/accept",
    );
    if (!endpoint) return reply("unavailable", 503);
    const response = await requestBackend(endpoint, {
      method: "POST",
      body: {
        token: input.token,
        name: input.name.trim(),
        password: input.password,
      },
      clientSource: await clientSourceFor("POST", endpoint),
    });
    if (response.status === 429) return reply("limited", 429);
    const body = await readBackendBody(response);
    if (!response.ok)
      return reply(
        record(body) && body.message === "Invitation expired"
          ? "expired"
          : [400, 403, 409].includes(response.status)
            ? "invalid"
            : "unavailable",
        [400, 403, 409].includes(response.status) ? 400 : 503,
      );
    return record(body) &&
      body.success === true &&
      record(body.data) &&
      body.data.accepted === true
      ? reply("accepted", 200)
      : reply("unavailable", 503);
  } catch {
    return reply("unavailable", 503);
  }
}
