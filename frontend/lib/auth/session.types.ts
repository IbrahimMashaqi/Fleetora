export type SessionRole = "PLATFORM_ADMIN" | "COMPANY_ADMIN" | "MERCHANT" | "ACCOUNTANT";
export const sessionRoleLabels: Record<SessionRole, string> = {
  PLATFORM_ADMIN: "Platform administrator",
  COMPANY_ADMIN: "Company administrator",
  MERCHANT: "Merchant",
  ACCOUNTANT: "Accountant",
};
export type SessionCompany = { id: string; name: string };
export type SessionUser = {
  id: string;
  name: string;
  email: string | null;
  role: SessionRole;
  orgId: string | null;
  company: SessionCompany | null;
};

const sessionRoles: readonly SessionRole[] = [
  "PLATFORM_ADMIN",
  "COMPANY_ADMIN",
  "MERCHANT",
  "ACCOUNTANT",
];

export function isSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== "object") return false;

  const user = value as Record<string, unknown>;
  if (
    typeof user.id !== "string" ||
    user.id.length === 0 ||
    typeof user.name !== "string" ||
    typeof user.email !== "string" && user.email !== null ||
    typeof user.role !== "string" ||
    !sessionRoles.includes(user.role as SessionRole) ||
    typeof user.orgId !== "string" && user.orgId !== null ||
    !("company" in user)
  ) {
    return false;
  }

  if (user.role === "PLATFORM_ADMIN") {
    return user.orgId === null && user.company === null;
  }

  if (!user.company || typeof user.company !== "object") return false;
  const company = user.company as Record<string, unknown>;
  return (
    typeof company.id === "string" &&
    company.id.length > 0 &&
    typeof company.name === "string" &&
    company.id === user.orgId
  );
}
