import type { Failure } from "@/features/operations/operations-contract";
import type { DriverAccessError } from "./driver-access.errors";
export type DriverAccess = {
  workerId: string;
  phone: string;
  linked: boolean;
  accessActive: boolean;
  offboarded: boolean;
  invitationBlockedReason: "PHONE_IN_USE" | "INVALID_PHONE" | null;
  pendingInvitation: { id: string; expiresAt: string } | null;
};
export type DriverAccessOperation = { id: string } & (
  | { kind: "read" | "invite" | "revokeInvitation" | "revokeAccess" }
  | { kind: "offboard"; revokeAccess: boolean }
);
export type DriverAccessResult =
  | { status: "ready"; data: DriverAccess }
  | { status: "issued"; phone: string; url: string; expiresAt: string }
  | { status: "updated" }
  | { status: Failure; reason?: DriverAccessError };
