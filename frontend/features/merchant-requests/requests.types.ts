import type { CompanyFailure } from "@/lib/api/company-request.server";
export type Scope = { userId: string; companyId: string };
export type RequestRow = {
  id: string;
  merchantId: string;
  shipmentId: string | null;
  kind: "AMEND" | "CANCEL" | "SETTLEMENT";
  reason: string;
  createdAt: string;
};
export type Preview = {
  request: RequestRow;
  parcelRevision: number;
  previousFee: string;
  proposedFee: string | null;
  pricingVersion: string | null;
  finalCustomerAmount: string | null;
  oldDestination: string;
  proposedDestination: string | null;
  currency: string;
  returnFee: string;
  canApprove: boolean;
};
export type RequestOperation =
  | { kind: "changes" | "settlements"; action: "list"; page?: number }
  | { kind: "changes"; action: "preview"; id: string }
  | {
      kind: "changes";
      action: "review";
      id: string;
      input: {
        action: "APPROVE" | "REJECT";
        parcelRevision: number;
        pricingVersion?: string;
        reason: string;
      };
    }
  | { kind: "settlements"; action: "review"; id: string };
export type RequestResult =
  | { status: CompanyFailure }
  | { status: "ready"; items: RequestRow[]; hasNext: boolean }
  | { status: "preview"; preview: Preview }
  | { status: "saved" };
