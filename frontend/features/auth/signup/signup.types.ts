import type { CompanyCurrency } from "@/lib/auth/session.types";
export { COMPANY_CURRENCIES, type CompanyCurrency } from "@/lib/auth/session.types";

export type SignupField = "name" | "email" | "password" | "currency";

export type SignupState =
  | { status: "idle" }
  | {
      status: "error";
      message?: string;
      fieldErrors?: Partial<Record<SignupField, string>>;
      values?: { name: string; email: string; currency?: string };
    }
  | { status: "success"; email: string };

export type SignupInput = { name: string; email: string; password: string; currency: CompanyCurrency };
