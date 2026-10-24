import "server-only";
import {
  getBackendEndpoint,
  readBackendBody,
  requestBackend,
} from "@/lib/api/backend.server";
import {
  accessCookie,
  clearSessionCookies,
  refreshCookie,
  setSessionTokens,
} from "@/lib/auth/cookies.server";
import { resolveSession } from "@/lib/auth/session.server";
import type {
  Invitation,
  InvitationOperation,
  InvitationResult,
  InvitationScope,
} from "./merchant-invitations.types";

type Jar = Parameters<typeof setSessionTokens>[0] &
  Parameters<typeof clearSessionCookies>[0] & {
    get(name: string): { value: string } | undefined;
  };
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function valid(operation: InvitationOperation) {
  if (!object(operation)) return false;
  if (operation.action === "list") return Object.keys(operation).length === 1;
  if (operation.action === "issue")
    return (
      Object.keys(operation).every((key) =>
        ["action", "email"].includes(key),
      ) &&
      typeof operation.email === "string" &&
      operation.email.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(operation.email.trim())
    );
  if (operation.action === "revoke")
    return (
      Object.keys(operation).every((key) => ["action", "id"].includes(key)) &&
      uuid(operation.id)
    );
  return false;
}
function invitation(
  value: unknown,
  scope: InvitationScope,
  merchantId: string,
): Invitation | null {
  if (
    !object(value) ||
    !uuid(value.id) ||
    value.companyId !== scope.companyId ||
    value.merchantId !== merchantId ||
    typeof value.email !== "string" ||
    value.email.length > 254 ||
    !["OWNER", "EMPLOYEE"].includes(String(value.role)) ||
    !["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"].includes(
      String(value.state),
    ) ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt))
  )
    return null;
  if (value.role !== "OWNER" && value.role !== "EMPLOYEE") return null;
  if (
    value.state !== "PENDING" &&
    value.state !== "ACCEPTED" &&
    value.state !== "EXPIRED" &&
    value.state !== "REVOKED"
  )
    return null;
  return {
    id: value.id,
    email: value.email,
    role: value.role,
    state: value.state,
    expiresAt: value.expiresAt,
  };
}

export async function merchantInvitationsForSession(
  jar: Jar,
  scope: InvitationScope,
  merchantId: string,
  operation: InvitationOperation,
): Promise<InvitationResult> {
  if (
    !valid(operation) ||
    !uuid(merchantId) ||
    !scope ||
    !uuid(scope.userId) ||
    !uuid(scope.companyId)
  )
    return { status: "invalid" };
  const access = jar.get(accessCookie)?.value;
  const session = await resolveSession({
    access,
    refresh: jar.get(refreshCookie)?.value,
  });
  if (session.status === "unauthenticated") {
    clearSessionCookies(jar);
    return { status: "unauthenticated" };
  }
  if (session.status === "refresh-rejected") return { status: "changed" };
  if (session.tokens) setSessionTokens(jar, session.tokens);
  if (session.status !== "ready") return { status: "unavailable" };
  if (session.user.role !== "COMPANY_ADMIN" || !session.user.company)
    return { status: "forbidden" };
  if (
    session.user.id !== scope.userId ||
    session.user.orgId !== scope.companyId
  )
    return { status: "changed" };
  const bearer = session.tokens?.accessToken ?? access;
  if (!bearer) return { status: "unavailable" };
  const writing = operation.action !== "list";
  let dispatched = false;
  try {
    const endpoint = getBackendEndpoint(
      `/operations/merchants/${merchantId}/invitations${operation.action === "revoke" ? `/${operation.id}` : ""}`,
    );
    if (!endpoint) return { status: "unavailable" };
    dispatched = true;
    const response = await requestBackend(endpoint, {
      method:
        operation.action === "list"
          ? "GET"
          : operation.action === "revoke"
            ? "DELETE"
            : "POST",
      bearer,
      expectedCompany: session.user.orgId ?? undefined,
      ...(operation.action === "issue"
        ? {
            body: {
              email: operation.email.trim().toLowerCase(),
              role: "OWNER",
            },
          }
        : {}),
    });
    if (response.status === 401) {
      clearSessionCookies(jar);
      return { status: "unauthenticated" };
    }
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 400) return { status: "invalid" };
    if (response.status === 404) return { status: "not-found" };
    if (response.status === 409) return { status: "conflict" };
    if (!response.ok) return { status: writing ? "uncertain" : "unavailable" };
    const envelope = await readBackendBody(response);
    if (
      !object(envelope) ||
      envelope.success !== true ||
      !object(envelope.data)
    )
      return { status: writing ? "uncertain" : "unavailable" };
    const data = envelope.data;
    if (data.companyId !== scope.companyId || data.merchantId !== merchantId)
      return { status: "changed" };
    if (operation.action === "revoke")
      return data.revoked === true
        ? { status: "revoked" }
        : { status: "uncertain" };
    if (operation.action === "issue") {
      const parsed = invitation(data, scope, merchantId);
      return parsed &&
        typeof data.token === "string" &&
        /^[a-f0-9]{64}$/.test(data.token) &&
        data.delivery === "MANUAL"
        ? { status: "issued", invitation: parsed, token: data.token }
        : { status: "uncertain" };
    }
    if (!Array.isArray(data.items) || data.items.length > 200)
      return { status: "unavailable" };
    const items: Invitation[] = [];
    for (const item of data.items) {
      const parsed = invitation(item, scope, merchantId);
      if (!parsed) return { status: "unavailable" };
      items.push(parsed);
    }
    return { status: "ready", items };
  } catch {
    return { status: writing && dispatched ? "uncertain" : "unavailable" };
  }
}
