export const platformRoles = [
  "SUPER_ADMIN",
  "COMPANY_MANAGER",
  "BILLING",
  "SUPPORT",
] as const;
export type PlatformRole = (typeof platformRoles)[number];
export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const isPlatformRole = (value: unknown): value is PlatformRole =>
  platformRoles.some((role) => role === value);
export type PlatformMe = {
  userId: string;
  name: string;
  email: string | null;
  role: PlatformRole;
};
export function isPlatformMe(value: unknown): value is PlatformMe {
  return (
    record(value) &&
    typeof value.userId === "string" &&
    typeof value.name === "string" &&
    (typeof value.email === "string" || value.email === null) &&
    isPlatformRole(value.role)
  );
}
export type PlatformMember = {
  id: string;
  name: string;
  email: string | null;
  role: PlatformRole;
  active: boolean;
};
export type PlatformInvitation = {
  id: string;
  email: string;
  role: PlatformRole;
  state: string;
  expiresAt: string;
};
export type PlatformOverview = {
  members: PlatformMember[];
  invitations: PlatformInvitation[];
};
export function isPlatformOverview(value: unknown): value is PlatformOverview {
  return (
    record(value) &&
    Array.isArray(value.members) &&
    Array.isArray(value.invitations) &&
    value.members.every(
      (m) =>
        record(m) &&
        typeof m.id === "string" &&
        typeof m.name === "string" &&
        (typeof m.email === "string" || m.email === null) &&
        isPlatformRole(m.role) &&
        typeof m.active === "boolean",
    ) &&
    value.invitations.every(
      (i) =>
        record(i) &&
        typeof i.id === "string" &&
        typeof i.email === "string" &&
        isPlatformRole(i.role) &&
        typeof i.expiresAt === "string" &&
        ["PENDING", "EXPIRED", "ACCEPTED", "REVOKED"].includes(String(i.state)),
    )
  );
}
export type PlatformOperation =
  | { action: "me" | "staff" | "audit" }
  | { action: "invite"; email: string; role: PlatformRole }
  | { action: "update"; id: string; role: PlatformRole; active: boolean }
  | { action: "revoke"; id: string };
