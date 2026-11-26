import "server-only";
import {
  getBackendEndpoint,
  readBackendBody,
  requestBackend,
} from "@/lib/api/backend.server";
import {
  clearSessionCookies,
  setSessionTokens,
} from "@/lib/auth/cookies.server";
import { object } from "@/features/operations/operations-contract";
import { authorizeDriverSession } from "./drivers.server";
import type { DriverScope } from "./drivers.types";
import type {
  DriverAccess,
  DriverAccessOperation,
  DriverAccessResult,
} from "./driver-access.types";
type Jar = Parameters<typeof setSessionTokens>[0] &
  Parameters<typeof clearSessionCookies>[0] & {
    get(name: string): { value: string } | undefined;
  };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function driverAccessForSession(
  jar: Jar,
  scope: DriverScope,
  operation: DriverAccessOperation,
): Promise<DriverAccessResult> {
  if (
    !object(operation) ||
    ![
      "read",
      "invite",
      "revokeInvitation",
      "revokeAccess",
      "offboard",
    ].includes(operation.kind) ||
    !uuid.test(operation.id) ||
    !Object.keys(operation).every((key) =>
      [
        "kind",
        "id",
        ...(operation.kind === "offboard" ? ["revokeAccess"] : []),
      ].includes(key),
    ) ||
    (operation.kind === "offboard" &&
      typeof operation.revokeAccess !== "boolean")
  )
    return { status: "invalid" };
  const authorized = await authorizeDriverSession(jar, scope);
  if (authorized.status !== "ready") return authorized;
  const writing = operation.kind !== "read";
  let dispatched = false;
  try {
    const suffix = ["invite", "revokeInvitation"].includes(operation.kind)
      ? "invitations"
      : operation.kind === "offboard"
        ? "offboarding"
        : "access";
    const endpoint = getBackendEndpoint(`drivers/${operation.id}/${suffix}`);
    if (!endpoint) return { status: "unavailable" };
    dispatched = true;
    const response = await requestBackend(endpoint, {
      bearer: authorized.bearer,
      expectedCompany: authorized.companyId,
      method:
        operation.kind === "read"
          ? "GET"
          : operation.kind.startsWith("revoke")
            ? "DELETE"
            : "POST",
      ...(operation.kind === "offboard"
        ? { body: { revokeAccess: operation.revokeAccess } }
        : {}),
    });
    if (response.status === 401) {
      clearSessionCookies(jar);
      return { status: "unauthenticated" };
    }
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 404) return { status: "not-found" };
    if (response.status === 400) return { status: "invalid" };
    if (response.status === 409) return { status: "conflict" };
    if (!response.ok) return { status: writing ? "uncertain" : "unavailable" };
    const body = await readBackendBody(response);
    if (!object(body) || body.success !== true || !object(body.data))
      return { status: writing ? "uncertain" : "unavailable" };
    const value = body.data;
    if (value.companyId !== authorized.companyId) return { status: "changed" };
    if (operation.kind === "read") {
      // Additive rollout: older APIs omit the reason. Unknown values are not
      // trusted as an invitation decision.
      const invitationBlockedReason = value.invitationBlockedReason ?? null;
      if (
        value.workerId !== operation.id ||
        typeof value.phone !== "string" ||
        typeof value.linked !== "boolean" ||
        typeof value.accessActive !== "boolean" ||
        typeof value.offboarded !== "boolean" ||
        (invitationBlockedReason !== null &&
          invitationBlockedReason !== "PHONE_IN_USE" &&
          invitationBlockedReason !== "INVALID_PHONE")
      )
        return { status: "unavailable" };
      const pending = value.pendingInvitation;
      let pendingInvitation: DriverAccess["pendingInvitation"] = null;
      if (pending !== null) {
        if (
          !object(pending) ||
          typeof pending.id !== "string" ||
          !uuid.test(pending.id) ||
          typeof pending.expiresAt !== "string" ||
          !Number.isFinite(Date.parse(pending.expiresAt))
        )
          return { status: "unavailable" };
        pendingInvitation = { id: pending.id, expiresAt: pending.expiresAt };
      }
      return {
        status: "ready",
        data: {
          workerId: operation.id,
          phone: value.phone,
          linked: value.linked,
          accessActive: value.accessActive,
          offboarded: value.offboarded,
          invitationBlockedReason,
          pendingInvitation,
        },
      };
    }
    if (operation.kind === "invite") {
      if (
        value.workerId !== operation.id ||
        typeof value.phone !== "string" ||
        !/^\+(9705[69]\d{7}|9725\d{8})$/.test(value.phone) ||
        typeof value.url !== "string" ||
        typeof value.expiresAt !== "string" ||
        !Number.isFinite(Date.parse(value.expiresAt))
      )
        return { status: "uncertain" };
      const url = new URL(value.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.pathname !== "/driver/activate" ||
        !/^#token=[a-f0-9]{64}$/.test(url.hash)
      )
        return { status: "uncertain" };
      return {
        status: "issued",
        phone: value.phone,
        url: url.toString(),
        expiresAt: value.expiresAt,
      };
    }
    return (
      operation.kind === "offboard"
        ? value.offboarded === true &&
          value.accessRevoked === operation.revokeAccess
        : value.revoked === true
    )
      ? { status: "updated" }
      : { status: "uncertain" };
  } catch {
    return { status: writing && dispatched ? "uncertain" : "unavailable" };
  }
}
