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
import {
  isPlatformMe,
  isPlatformOverview,
  isPlatformRole,
  record,
} from "./platform-contract";
export async function handlePlatform(request: NextRequest) {
  const envelope = new NextResponse(null, {
    headers: { "Cache-Control": "private, no-store" },
  });
  const reply = (status: string, code: number, data?: unknown) =>
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
    if (!record(input) || typeof input.userId !== "string")
      return reply("invalid", 400);
    let path: string,
      method: "GET" | "POST" | "PATCH" | "DELETE",
      body: unknown;
    const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
    if (["me", "staff", "audit"].includes(String(input.action))) {
      path = `platform/${input.action}`;
      method = "GET";
    } else if (
      input.action === "invite" &&
      typeof input.email === "string" &&
      input.email.length <= 254 &&
      isPlatformRole(input.role)
    ) {
      path = "platform/invitations";
      method = "POST";
      body = { email: input.email, role: input.role };
    } else if (
      input.action === "update" &&
      typeof input.id === "string" &&
      uuid.test(input.id) &&
      isPlatformRole(input.role) &&
      typeof input.active === "boolean"
    ) {
      path = `platform/staff/${input.id}`;
      method = "PATCH";
      body = { role: input.role, active: input.active };
    } else if (
      input.action === "revoke" &&
      typeof input.id === "string" &&
      uuid.test(input.id)
    ) {
      path = `platform/invitations/${input.id}`;
      method = "DELETE";
    } else if (input.action === "companies") {
      const page = input.page ?? 1,
        size = input.pageSize ?? 25;
      if (
        typeof page !== "number" ||
        !Number.isInteger(page) ||
        page < 1 ||
        typeof size !== "number" ||
        !Number.isInteger(size) ||
        size < 1 ||
        size > 100 ||
        typeof input.search !== "string" ||
        input.search.length > 100 ||
        typeof input.status !== "string" ||
        !["", "PENDING", "ACTIVE", "REJECTED", "SUSPENDED"].includes(
          input.status,
        )
      )
        return reply("invalid", 400);
      path = `platform/companies?${new URLSearchParams({ page: String(page), pageSize: String(size), search: input.search, ...(input.status ? { status: input.status } : {}) })}`;
      method = "GET";
    } else if (input.action === "createCompany") {
      if (
        Object.keys(input).some(
          (key) =>
            ![
              "action",
              "userId",
              "name",
              "phone",
              "address",
              "currency",
              "adminName",
              "adminEmail",
            ].includes(key),
        ) ||
        typeof input.name !== "string" ||
        input.name.trim().length < 2 ||
        input.name.length > 160 ||
        typeof input.adminName !== "string" ||
        input.adminName.trim().length < 2 ||
        input.adminName.length > 120 ||
        typeof input.adminEmail !== "string" ||
        input.adminEmail.length > 254 ||
        !["ILS", "USD", "EUR", "JOD"].includes(String(input.currency)) ||
        (input.phone !== undefined &&
          (typeof input.phone !== "string" || input.phone.length > 40)) ||
        (input.address !== undefined &&
          (typeof input.address !== "string" || input.address.length > 500))
      )
        return reply("invalid", 400);
      path = "platform/companies";
      method = "POST";
      body = {
        name: input.name,
        phone: input.phone,
        address: input.address,
        currency: input.currency,
        adminName: input.adminName,
        adminEmail: input.adminEmail,
      };
    } else if (
      ["company", "transitionCompany", "reissueCompanyAdmin"].includes(
        String(input.action),
      ) &&
      typeof input.id === "string" &&
      uuid.test(input.id)
    ) {
      path = `platform/companies/${input.id}`;
      method = "GET";
      if (input.action === "transitionCompany") {
        if (
          Object.keys(input).some(
            (key) =>
              ![
                "action",
                "userId",
                "id",
                "transition",
                "reason",
                "revision",
              ].includes(key),
          ) ||
          !["approve", "reject", "suspend", "reactivate"].includes(
            String(input.transition),
          ) ||
          typeof input.revision !== "number" ||
          !Number.isInteger(input.revision) ||
          input.revision < 1 ||
          (input.reason !== undefined &&
            (typeof input.reason !== "string" ||
              input.reason.trim().length < 1 ||
              input.reason.length > 500))
        )
          return reply("invalid", 400);
        path += "/transitions";
        method = "POST";
        body = {
          action: input.transition,
          reason: input.reason,
          revision: input.revision,
        };
      } else if (input.action === "reissueCompanyAdmin") {
        path += "/admin-invitation";
        method = "POST";
        body = {};
      }
    } else return reply("invalid", 400);
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
    if (session.user.id !== input.userId) return reply("changed", 409);
    if (
      session.user.role !== "PLATFORM_ADMIN" ||
      session.user.company !== null ||
      session.user.orgId !== null
    )
      return reply("forbidden", 403);
    const endpoint = getBackendEndpoint(path);
    if (!endpoint) return reply("unavailable", 503);
    const response = await requestBackend(endpoint, {
      method,
      body,
      bearer: session.tokens?.accessToken ?? jar.get(accessCookie)?.value,
    });
    const result = await readBackendBody(response);
    if (response.status === 401) {
      clearSessionCookies(jar);
      return reply("unauthenticated", 401);
    }
    if (!response.ok) {
      const message = record(result) ? result.message : null;
      const status =
        message === "Keep at least one active Super Admin"
          ? "last-admin"
          : message === "An account already uses this email"
            ? "email-in-use"
            : response.status === 403
              ? "forbidden"
              : response.status === 404
                ? "not-found"
                : response.status === 409
                  ? "conflict"
                  : response.status === 400
                    ? "invalid"
                    : "unavailable";
      return reply(
        status,
        [400, 403, 404, 409].includes(response.status) ? response.status : 503,
      );
    }
    if (!record(result) || result.success !== true || !record(result.data))
      return reply("unavailable", 503);
    if (
      (input.action === "me" &&
        (!isPlatformMe(result.data) ||
          result.data.userId !== session.user.id)) ||
      (input.action === "staff" && !isPlatformOverview(result.data))
    )
      return reply("unavailable", 503);
    return reply("ready", 200, result.data);
  } catch {
    return reply("unavailable", 503);
  }
}
