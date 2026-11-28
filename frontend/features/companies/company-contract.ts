import { record } from "@/features/platform/platform-contract";
export type Company = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  approvalStatus: "PENDING" | "ACTIVE" | "REJECTED";
  suspended: boolean;
  status: string;
  rejectionReason: string | null;
  currency: string;
  plan: string;
  revision: number;
};
export type CompanyDetails = {
  company: Company;
  primaryAdminId: string | null;
  admins: {
    id: string;
    name: string;
    email: string | null;
    active: boolean;
    verified: boolean;
  }[];
  events: {
    id: string;
    action: string;
    createdAt: string;
    details?: unknown;
  }[];
};
export function isCompany(value: unknown): value is Company {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.phone === null || typeof value.phone === "string") &&
    (value.address === null || typeof value.address === "string") &&
    ["PENDING", "ACTIVE", "REJECTED"].includes(String(value.approvalStatus)) &&
    typeof value.suspended === "boolean" &&
    typeof value.status === "string" &&
    (value.rejectionReason === null ||
      typeof value.rejectionReason === "string") &&
    typeof value.currency === "string" &&
    typeof value.plan === "string" &&
    Number.isInteger(value.revision)
  );
}
export function isCompanyDetails(value: unknown): value is CompanyDetails {
  return (
    record(value) &&
    isCompany(value.company) &&
    (value.primaryAdminId === null ||
      typeof value.primaryAdminId === "string") &&
    Array.isArray(value.admins) &&
    value.admins.every(
      (a) =>
        record(a) &&
        typeof a.id === "string" &&
        typeof a.name === "string" &&
        (a.email === null || typeof a.email === "string") &&
        typeof a.active === "boolean" &&
        typeof a.verified === "boolean",
    ) &&
    Array.isArray(value.events) &&
    value.events.every(
      (e) =>
        record(e) &&
        typeof e.id === "string" &&
        typeof e.action === "string" &&
        typeof e.createdAt === "string",
    )
  );
}
