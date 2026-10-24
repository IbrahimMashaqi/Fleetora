import "server-only";
import { getBackendEndpoint, readBackendBody, requestBackend } from "@/lib/api/backend.server";
import { accessCookie, refreshCookie, clearSessionCookies, setSessionTokens } from "@/lib/auth/cookies.server";
import { resolveSession } from "@/lib/auth/session.server";
import { parseHeadquarters, parseSnapshot, record, validHeadquartersInput } from "./fleet-state";
import type { FleetOperation, FleetResult, FleetScope } from "./fleet.types";

type Jar = Parameters<typeof setSessionTokens>[0] & Parameters<typeof clearSessionCookies>[0] & {
  get(name: string): { value: string } | undefined;
};

/** Only an intentionally public origin crosses the server/client boundary. */
export function publicRealtimeEndpoint(): string | null {
  const configured = process.env.NEXT_PUBLIC_FLEETORA_REALTIME_URL;
  const source = configured || process.env.FLEETORA_API_URL;
  if (!source) return null;
  try {
    const url = new URL(source);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && (process.env.NODE_ENV === "production" || !local)) return null;
    // Paths on the server REST base are never exposed; Socket.IO uses its own path.
    if (configured && ((url.pathname !== '/' && url.pathname !== '/fleet') || url.search || url.hash)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function validOperation(operation: unknown): operation is FleetOperation {
  if (!record(operation)) return false;
  return operation.kind === "snapshot" || operation.kind === "headquarters" || operation.kind === "ticket" ||
    (operation.kind === "save-headquarters" && validHeadquartersInput(operation.input));
}

export async function trackingForSession(jar: Jar, expected: FleetScope, operation: FleetOperation): Promise<FleetResult> {
  if (!validOperation(operation)) return { status: "invalid" };
  const access = jar.get(accessCookie)?.value;
  const session = await resolveSession({ access, refresh: jar.get(refreshCookie)?.value });
  if (session.status === "unauthenticated") {
    clearSessionCookies(jar);
    return { status: "unauthenticated" };
  }
  if (session.status === "refresh-rejected") return { status: "changed" };
  if (session.tokens) setSessionTokens(jar, session.tokens);
  if (session.status !== "ready") return { status: "unavailable" };
  if (session.user.role !== "COMPANY_ADMIN" || !session.user.company) return { status: "forbidden" };
  if (!expected || expected.userId !== session.user.id || expected.companyId !== session.user.orgId) return { status: "changed" };
  const bearer = session.tokens?.accessToken ?? access;
  if (!bearer) return { status: "unavailable" };
  const companyId = session.user.company.id;
  const writing = operation.kind === "save-headquarters";
  let dispatched = false;
  try {
    const path = operation.kind === "snapshot" ? "fleet/locations" : operation.kind === "ticket" ? "fleet/socket-ticket" : "companies/me/headquarters";
    const endpoint = getBackendEndpoint(path);
    if (!endpoint) return { status: "unavailable" };
    const realtime = operation.kind === "ticket" ? publicRealtimeEndpoint() : null;
    if (operation.kind === "ticket" && !realtime) return { status: "unavailable" };
    const body = writing ? {
      latitude: operation.input.latitude, longitude: operation.input.longitude,
      address: operation.input.address, expectedRevision: operation.input.expectedRevision,
    } : undefined;
    dispatched = true;
    const response = await requestBackend(endpoint, {
      method: writing ? "PATCH" : operation.kind === "ticket" ? "POST" : "GET",
      bearer, body, expectedCompany: companyId,
    });
    if (response.status === 401) {
      clearSessionCookies(jar);
      return { status: "unauthenticated" };
    }
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 400) return { status: "invalid" };
    if (response.status === 409) return { status: "conflict" };
    if (!response.ok) return { status: writing ? "uncertain" : "unavailable" };
    const envelope = await readBackendBody(response);
    if (!record(envelope) || envelope.success !== true || !record(envelope.data)) return { status: writing ? "uncertain" : "unavailable" };
    const data = envelope.data;
    if (data.companyId !== companyId) return { status: "changed" };
    if (operation.kind === "snapshot") {
      const snapshot = parseSnapshot(data, companyId);
      return snapshot ? { status: "snapshot", data: snapshot } : { status: "unavailable" };
    }
    if (operation.kind === "ticket") {
      if (!realtime || typeof data.ticket !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(data.ticket) ||
        typeof data.expiresAt !== "string" || !Number.isFinite(Date.parse(data.expiresAt))) return { status: "unavailable" };
      return { status: "ticket", data: { companyId, ticket: data.ticket, expiresAt: data.expiresAt, endpoint: realtime } };
    }
    const headquarters = data.headquarters === null ? null : parseHeadquarters(data.headquarters);
    if ((data.headquarters !== null && !headquarters) || (writing && !headquarters)) return { status: writing ? "uncertain" : "unavailable" };
    return { status: "headquarters", data: { companyId, headquarters } };
  } catch {
    return { status: writing && dispatched ? "uncertain" : "unavailable" };
  }
}
