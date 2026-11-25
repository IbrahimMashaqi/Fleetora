export type StaffRole = "COMPANY_ADMIN" | "ACCOUNTANT";
export const staffRoles: readonly StaffRole[] = ["ACCOUNTANT", "COMPANY_ADMIN"];
export type StaffMember = {
  id: string;
  fullName: string;
  email: string | null;
  role: StaffRole;
  active: boolean;
};
export type StaffInvitationState = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
export type StaffInvitation = {
  id: string;
  email: string;
  role: StaffRole;
  state: StaffInvitationState;
  expiresAt: string;
};
export type StaffScope = { userId: string; companyId: string };
export type StaffReadResult =
  | { status: "ready"; members: StaffMember[]; invitations: StaffInvitation[] }
  | { status: "unauthenticated" | "forbidden" | "changed" | "unavailable" };
export type StaffWrite =
  | { action: "issue"; email: string; role: StaffRole }
  | { action: "revoke"; id: string };
export type StaffWriteFailure =
  | "unauthenticated"
  | "forbidden"
  | "changed"
  | "invalid"
  | "not-found"
  | "conflict"
  | "unavailable"
  | "uncertain";
export type StaffWriteResult =
  | { status: "issued"; invitation: StaffInvitation; token: string }
  | { status: "revoked" }
  | { status: StaffWriteFailure };

export type AcceptInvitationField = "name" | "password" | "confirmPassword";
export type AcceptInvitationState =
  | { status: "idle" }
  | {
      status: "error";
      message?: "invalid" | "conflict" | "limited" | "unavailable";
      fieldErrors?: Partial<Record<AcceptInvitationField, string>>;
      name?: string;
    }
  | { status: "accepted"; email: string };
