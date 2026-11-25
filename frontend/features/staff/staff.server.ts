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
  StaffInvitation,
  StaffMember,
  StaffReadResult,
  StaffRole,
  StaffScope,
  StaffWrite,
  StaffWriteResult,
} from "./staff.types";

type SessionCookies = Parameters<typeof setSessionTokens>[0] &
  Parameters<typeof clearSessionCookies>[0] & {
    get(name: string): { value: string } | undefined;
  };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const token = /^[a-f0-9]{64}$/;
const states = ["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"] as const;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isState = (value: unknown): value is StaffInvitation["state"] =>
  states.some((state) => state === value);
const isRole = (value: unknown): value is StaffRole =>
  value === "COMPANY_ADMIN" || value === "ACCOUNTANT";

function parseMember(value: unknown): StaffMember | null {
  if (
    !object(value) ||
    typeof value.id !== "string" ||
    !uuid.test(value.id) ||
    typeof value.fullName !== "string" ||
    (value.email !== null && typeof value.email !== "string") ||
    !isRole(value.role) ||
    typeof value.active !== "boolean"
  )
    return null;
  return {
    id: value.id,
    fullName: value.fullName,
    email: value.email,
    role: value.role,
    active: value.active,
  };
}
function parseInvitation(value: unknown): StaffInvitation | null {
  if (
    !object(value) ||
    typeof value.id !== "string" ||
    !uuid.test(value.id) ||
    typeof value.email !== "string" ||
    !isRole(value.role) ||
    !isState(value.state) ||
    typeof value.expiresAt !== "string" ||
    Number.isNaN(Date.parse(value.expiresAt))
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

type AuthorizedSession =
  | { status: "ready"; bearer: string; companyId: string }
  | { status: "unauthenticated" | "forbidden" | "changed" | "unavailable" };

async function authorizeStaffSession(
  jar: SessionCookies,
  expected: StaffScope,
): Promise<AuthorizedSession> {
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
  if (
    session.user.role !== "COMPANY_ADMIN" ||
    !session.user.company ||
    !session.user.orgId
  )
    return { status: "forbidden" };
  // Submitted identity is only a stale-context veto. The JWT selects all scope.
  if (
    !object(expected) ||
    session.user.id !== expected.userId ||
    session.user.orgId !== expected.companyId
  )
    return { status: "changed" };
  const bearer = session.tokens?.accessToken ?? access;
  if (!bearer) return { status: "unavailable" };
  return { status: "ready", bearer, companyId: session.user.orgId };
}

export async function readStaffForSession(
  jar: SessionCookies,
  expected: StaffScope,
): Promise<StaffReadResult> {
  const authorized = await authorizeStaffSession(jar, expected);
  if (authorized.status !== "ready") return authorized;
  const { bearer, companyId } = authorized;
  try {
    const endpoint = getBackendEndpoint("company/staff");
    if (!endpoint) return { status: "unavailable" };
    const response = await requestBackend(endpoint, { method: "GET", bearer });
    if (response.status === 401) {
      clearSessionCookies(jar);
      return { status: "unauthenticated" };
    }
    if (response.status === 403) return { status: "forbidden" };
    if (!response.ok) return { status: "unavailable" };
    const body = await readBackendBody(response);
    if (!object(body) || body.success !== true || !object(body.data))
      return { status: "unavailable" };
    const data = body.data;
    if (data.companyId !== companyId) return { status: "changed" };
    if (!Array.isArray(data.members) || !Array.isArray(data.invitations))
      return { status: "unavailable" };
    const members = data.members.map(parseMember);
    const invitations = data.invitations.map(parseInvitation);
    if (
      members.some((member) => !member) ||
      invitations.some((invitation) => !invitation)
    )
      return { status: "unavailable" };
    return {
      status: "ready",
      members: members.filter((member): member is StaffMember => !!member),
      invitations: invitations.filter(
        (invitation): invitation is StaffInvitation => !!invitation,
      ),
    };
  } catch {
    return { status: "unavailable" };
  }
}

function validWrite(operation: StaffWrite): StaffWrite | null {
  if (!object(operation)) return null;
  if (operation.action === "issue") {
    if (
      !Object.keys(operation).every((key) =>
        ["action", "email", "role"].includes(key),
      ) ||
      typeof operation.email !== "string" ||
      !isRole(operation.role)
    )
      return null;
    const address = operation.email.trim().toLowerCase();
    return address.length <= 254 && email.test(address)
      ? { action: "issue", email: address, role: operation.role }
      : null;
  }
  if (
    operation.action === "revoke" &&
    Object.keys(operation).every((key) => ["action", "id"].includes(key)) &&
    typeof operation.id === "string" &&
    uuid.test(operation.id)
  )
    return { action: "revoke", id: operation.id };
  return null;
}

export async function writeStaffForSession(
  jar: SessionCookies,
  expected: StaffScope,
  submitted: StaffWrite,
): Promise<StaffWriteResult> {
  const operation = validWrite(submitted);
  if (!operation) return { status: "invalid" };
  const authorized = await authorizeStaffSession(jar, expected);
  if (authorized.status !== "ready") return authorized;
  const { bearer, companyId } = authorized;
  let dispatched = false;
  try {
    const endpoint = getBackendEndpoint(
      operation.action === "issue"
        ? "company/staff/invitations"
        : `company/staff/invitations/${operation.id}`,
    );
    if (!endpoint) return { status: "unavailable" };
    dispatched = true;
    const response = await requestBackend(endpoint, {
      method: operation.action === "issue" ? "POST" : "DELETE",
      body:
        operation.action === "issue"
          ? { email: operation.email, role: operation.role }
          : undefined,
      bearer,
      expectedCompany: companyId,
    });
    if (response.status === 401) {
      clearSessionCookies(jar);
      return { status: "unauthenticated" };
    }
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 400) return { status: "invalid" };
    if (response.status === 404) return { status: "not-found" };
    if (response.status === 409) return { status: "conflict" };
    if (!response.ok) return { status: "uncertain" };
    const body = await readBackendBody(response);
    if (!object(body) || body.success !== true || !object(body.data))
      return { status: "uncertain" };
    if (body.data.companyId !== companyId) return { status: "changed" };
    if (operation.action === "revoke")
      return body.data.revoked === true
        ? { status: "revoked" }
        : { status: "uncertain" };
    const invitation = parseInvitation(body.data.invitation);
    if (
      !invitation ||
      invitation.email !== operation.email ||
      invitation.role !== operation.role ||
      typeof body.data.token !== "string" ||
      !token.test(body.data.token)
    )
      return { status: "uncertain" };
    return { status: "issued", invitation, token: body.data.token };
  } catch {
    return { status: dispatched ? "uncertain" : "unavailable" };
  }
}
