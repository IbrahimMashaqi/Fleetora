import type { Scope } from "@/features/operations/operations-contract";

export type InvitationScope = Scope;
export type Invitation = {
  id: string;
  email: string;
  role: "OWNER" | "EMPLOYEE";
  state: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  expiresAt: string;
};
export type InvitationOperation =
  | { action: "list" }
  | { action: "issue"; email: string }
  | { action: "revoke"; id: string };
export type InvitationFailure =
  | "unauthenticated"
  | "changed"
  | "forbidden"
  | "invalid"
  | "not-found"
  | "conflict"
  | "unavailable"
  | "uncertain";
export type InvitationResult =
  | { status: "ready"; items: Invitation[] }
  | { status: "issued"; invitation: Invitation; token: string }
  | { status: "revoked" }
  | { status: InvitationFailure };
