import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { hasSameOrigin } from "@/lib/auth/same-origin.server";
import { resolveSession } from "@/lib/auth/session.server";
import {
  accessCookie,
  refreshCookie,
  setSessionTokens,
  clearSessionCookies,
} from "@/lib/auth/cookies.server";
import {
  getBackendEndpoint,
  requestBackend,
  readBackendBody,
} from "@/lib/api/backend.server";
import { record } from "@/features/platform/platform-contract";
import { isCompany } from "./company-contract";
export async function handleCompany(request: NextRequest) {
  const envelope = new NextResponse(null, {
      headers: { "Cache-Control": "private, no-store" },
    }),
    reply = (status: string, code: number, data?: unknown) =>
      NextResponse.json(
        { status, ...(data === undefined ? {} : { data }) },
        { status: code, headers: envelope.headers },
      );
  if (!hasSameOrigin(request)) return reply("forbidden", 403);
  if (request.nextUrl.search) return reply("invalid", 400);
  try {
    const text = await request.text();
    if (text.length > 4096) return reply("invalid", 400);
    const input: unknown = JSON.parse(text);
    if (
      !record(input) ||
      !["status", "profile", "save", "resubmit"].includes(
        String(input.action),
      ) ||
      typeof input.userId !== "string" ||
      typeof input.companyId !== "string"
    )
      return reply("invalid", 400);
    const write = input.action === "save" || input.action === "resubmit",
      fields = [
        "action",
        "userId",
        "companyId",
        ...(write ? ["name", "phone", "address", "revision"] : []),
      ];
    if (
      Object.keys(input).some((key) => !fields.includes(key)) ||
      (write &&
        (typeof input.name !== "string" ||
          input.name.trim().length < 2 ||
          input.name.length > 160 ||
          !Number.isInteger(input.revision) ||
          (typeof input.phone !== "string" && input.phone !== undefined) ||
          (typeof input.address !== "string" && input.address !== undefined)))
    )
      return reply("invalid", 400);
    const jar = {
      get: (name: string) => request.cookies.get(name),
      set: envelope.cookies.set.bind(envelope.cookies),
      delete: envelope.cookies.delete.bind(envelope.cookies),
    };
    const session = await resolveSession({
      access: jar.get(accessCookie)?.value,
      refresh: jar.get(refreshCookie)?.value,
    });
    if (session.status === "unauthenticated") {
      clearSessionCookies(jar);
      return reply("unauthenticated", 401);
    }
    if (session.status === "refresh-rejected") return reply("changed", 409);
    if (session.tokens) setSessionTokens(jar, session.tokens);
    if (session.status !== "ready") return reply("unavailable", 503);
    if (
      session.user.id !== input.userId ||
      session.user.orgId !== input.companyId ||
      session.user.company?.id !== input.companyId
    )
      return reply("changed", 409);
    if (
      session.user.role === "PLATFORM_ADMIN" ||
      (input.action !== "status" && session.user.role !== "COMPANY_ADMIN")
    )
      return reply("forbidden", 403);
    const endpoint = getBackendEndpoint(
      input.action === "status"
        ? "company/status"
        : input.action === "resubmit"
          ? "company/status/resubmit"
          : "company/profile",
    );
    if (!endpoint) return reply("unavailable", 503);
    const response = await requestBackend(endpoint, {
      method: write ? (input.action === "save" ? "PATCH" : "POST") : "GET",
      ...(write
        ? {
            body: {
              name: input.name,
              phone: input.phone,
              address: input.address,
              revision: input.revision,
            },
          }
        : {}),
      bearer: session.tokens?.accessToken ?? jar.get(accessCookie)?.value,
      expectedCompany: input.companyId,
    });
    const body = await readBackendBody(response);
    if (response.status === 401) {
      clearSessionCookies(jar);
      return reply("unauthenticated", 401);
    }
    if (!response.ok)
      return reply(
        response.status === 403
          ? "forbidden"
          : response.status === 409
            ? "conflict"
            : response.status === 400
              ? "invalid"
              : "unavailable",
        [400, 403, 409].includes(response.status) ? response.status : 503,
      );
    return record(body) &&
      body.success === true &&
      record(body.data) &&
      isCompany(body.data.company) &&
      body.data.company.id === session.user.orgId
      ? reply("ready", 200, body.data)
      : reply("unavailable", 503);
  } catch {
    return reply("unavailable", 503);
  }
}
