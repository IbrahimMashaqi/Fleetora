import "server-only";
import {
  companyRequest,
  type CompanyJar,
} from "@/lib/api/company-request.server";
import type {
  Preview,
  RequestOperation,
  RequestResult,
  RequestRow,
  Scope,
} from "./requests.types";
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function row(
  value: unknown,
  companyId: string,
  kind: "changes" | "settlements",
): RequestRow | null {
  if (
    !object(value) ||
    value.companyId !== companyId ||
    typeof value.id !== "string" ||
    !uuid.test(value.id) ||
    typeof value.merchantId !== "string" ||
    !uuid.test(value.merchantId) ||
    typeof value.createdAt !== "string"
  )
    return null;
  if (
    kind === "changes" &&
    (typeof value.shipmentId !== "string" ||
      !uuid.test(value.shipmentId) ||
      !["AMEND", "CANCEL"].includes(String(value.kind)) ||
      typeof value.reason !== "string")
  )
    return null;
  return {
    id: value.id,
    merchantId: value.merchantId,
    shipmentId: typeof value.shipmentId === "string" ? value.shipmentId : null,
    kind:
      kind === "settlements"
        ? "SETTLEMENT"
        : value.kind === "AMEND"
          ? "AMEND"
          : "CANCEL",
    reason:
      typeof value.reason === "string"
        ? value.reason
        : typeof value.notes === "string"
          ? value.notes
          : "",
    createdAt: value.createdAt,
  };
}
export async function requestsForSession(
  jar: CompanyJar,
  scope: Scope,
  operation: RequestOperation,
): Promise<RequestResult> {
  if (
    !object(operation) ||
    !["changes", "settlements"].includes(operation.kind) ||
    !["list", "preview", "review"].includes(operation.action) ||
    (operation.action !== "list" && !uuid.test(operation.id))
  )
    return { status: "invalid" };
  const page = operation.action === "list" ? (operation.page ?? 1) : 1;
  if (!Number.isInteger(page) || page < 1 || page > 100000)
    return { status: "invalid" };
  if (
    operation.action === "review" &&
    operation.kind === "changes" &&
    (!object(operation.input) ||
      !["APPROVE", "REJECT"].includes(operation.input.action) ||
      !Number.isInteger(operation.input.parcelRevision) ||
      operation.input.parcelRevision < 1 ||
      typeof operation.input.reason !== "string" ||
      operation.input.reason.trim().length < 3 ||
      operation.input.reason.length > 500)
  )
    return { status: "invalid" };
  const base =
    operation.kind === "changes"
      ? "/parcel-requests"
      : "/merchant-settlement-requests";
  const path =
    operation.action === "list"
      ? `${base}?page=${page}&pageSize=25`
      : `${base}/${operation.id}${operation.action === "review" ? "/review" : ""}`;
  const response = await companyRequest(jar, scope, {
    path,
    method: operation.action === "review" ? "POST" : "GET",
    accountant: operation.kind === "settlements",
    ...(operation.kind === "changes" && operation.action === "review"
      ? {
          body: {
            action: operation.input.action,
            parcelRevision: operation.input.parcelRevision,
            pricingVersion: operation.input.pricingVersion,
            reason: operation.input.reason,
          },
        }
      : {}),
  });
  if (response.status !== "data") return response;
  const data = response.data;
  if (operation.action === "review")
    return { status: data.reviewed === true ? "saved" : "uncertain" };
  if (operation.action === "list") {
    if (!Array.isArray(data.items) || data.items.length > 100)
      return { status: "unavailable" };
    const items: RequestRow[] = [];
    for (const value of data.items) {
      const item = row(value, scope.companyId, operation.kind);
      if (!item) return { status: "changed" };
      items.push(item);
    }
    return { status: "ready", items, hasNext: data.hasNext === true };
  }
  const request = row(data.request, scope.companyId, "changes");
  if (
    !request ||
    request.id !== operation.id ||
    !object(data.parcel) ||
    data.parcel.companyId !== scope.companyId ||
    data.parcel.merchantId !== request.merchantId ||
    data.parcel.id !== request.shipmentId ||
    typeof data.parcelRevision !== "number" ||
    typeof data.previousFee !== "string" ||
    typeof data.parcel.destination !== "string"
  )
    return { status: "changed" };
  const pricing = object(data.pricing) ? data.pricing : null;
  if (
    typeof data.canApprove !== "boolean" ||
    typeof data.currency !== "string" ||
    typeof data.returnFee !== "string"
  )
    return { status: "unavailable" };
  if (
    request.kind === "AMEND" &&
    pricing &&
    (typeof pricing.pricingVersion !== "string" ||
      typeof pricing.finalCustomerAmount !== "string" ||
      typeof data.proposedFee !== "string")
  )
    return { status: "unavailable" };
  const proposed =
    object(data.request) && object(data.request.proposed)
      ? data.request.proposed
      : null;
  const preview: Preview = {
    request,
    parcelRevision: data.parcelRevision,
    previousFee: data.previousFee,
    proposedFee: typeof data.proposedFee === "string" ? data.proposedFee : null,
    pricingVersion:
      typeof pricing?.pricingVersion === "string"
        ? pricing.pricingVersion
        : null,
    finalCustomerAmount:
      typeof pricing?.finalCustomerAmount === "string"
        ? pricing.finalCustomerAmount
        : null,
    oldDestination: data.parcel.destination,
    proposedDestination:
      typeof proposed?.destination === "string" ? proposed.destination : null,
    currency: data.currency,
    returnFee: data.returnFee,
    canApprove: data.canApprove,
  };
  return { status: "preview", preview };
}
