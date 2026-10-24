import {
  object,
  type Failure,
  type Scope,
} from "@/features/operations/operations-contract";
import { validMoneyInput } from "@/features/operations/money";
export type { Scope };
export type Currency = "ILS" | "USD" | "EUR" | "JOD";
export type Plan = {
  id: string;
  companyId: string;
  name: string;
  currency: Currency;
  active: boolean;
  revision: number;
};
export type Zone = Plan & { city: string; baseFee: string };
export type Tariff = {
  id: string;
  companyId: string;
  planId: string;
  zoneId: string;
  zoneName: string | null;
  city: string | null;
  fee: string;
  discount: string;
  promotionDiscount: string;
  promotionLabel: string | null;
};
export type PricingPage<T> = {
  items: T[];
  page: number;
  pageSize: number;
  hasNext: boolean;
};
export type PlanInput = { name: string; currency: Currency; active: boolean };
export type ZoneInput = PlanInput & { city: string; baseFee: string };
export type PricingOperation =
  | { kind: "zones" | "plans"; page: number }
  | { kind: "plan"; id: string }
  | { kind: "save-zone"; id?: string; input: ZoneInput & { revision?: number } }
  | { kind: "save-plan"; id?: string; input: PlanInput & { revision?: number } }
  | {
      kind: "tariff";
      id: string;
      zoneId: string;
      input: {
        revision: number;
        fee: string;
        discount: string;
        promotionDiscount: string;
        promotionLabel?: string;
      };
    }
  | {
      kind: "assignment";
      id: string;
      input: { planId: string; revision: number; discountAmount: string };
    };
export type PricingData =
  | { kind: "zones"; page: PricingPage<Zone> }
  | { kind: "plans"; page: PricingPage<Plan> }
  | { kind: "plan"; plan: Plan; tariffs: Tariff[] };
export type PricingResult =
  | { status: Failure }
  | { status: "saved" }
  | { status: "ready"; data: PricingData };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const pricingId = (value: unknown): value is string =>
  typeof value === "string" && uuid.test(value);
export const currency = (value: unknown): value is Currency =>
  value === "ILS" || value === "USD" || value === "EUR" || value === "JOD";
const revision = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const decimal = (value: unknown): value is string =>
  typeof value === "string" && /^\d{1,14}(?:\.\d{1,3})?$/.test(value);
const only = (value: Record<string, unknown>, fields: string[]) =>
  Object.keys(value).every((key) => fields.includes(key));

export function preparePricingOperation(
  value: unknown,
): {
  path: string;
  method: "GET" | "POST" | "PATCH" | "PUT";
  body?: unknown;
} | null {
  if (!object(value)) return null;
  if (
    (value.kind === "zones" || value.kind === "plans") &&
    only(value, ["kind", "page"]) &&
    revision(value.page) &&
    value.page <= 100000
  )
    return {
      path: `merchant-pricing/${value.kind}?page=${value.page}&pageSize=25`,
      method: "GET",
    };
  if (!pricingId(value.id) && value.id !== undefined) return null;
  if (
    value.kind === "plan" &&
    pricingId(value.id) &&
    only(value, ["kind", "id"])
  )
    return { path: `merchant-pricing/plans/${value.id}`, method: "GET" };
  const input = value.input;
  if (!object(input)) return null;
  if (value.kind === "save-zone" || value.kind === "save-plan") {
    const isZone = value.kind === "save-zone";
    if (
      !only(value, ["kind", "id", "input"]) ||
      !only(input, [
        "name",
        "currency",
        "active",
        "revision",
        ...(isZone ? ["city", "baseFee"] : []),
      ]) ||
      !text(input.name, 150) ||
      !currency(input.currency) ||
      typeof input.active !== "boolean" ||
      (value.id !== undefined && !revision(input.revision))
    )
      return null;
    if (
      isZone &&
      (!text(input.city, 100) ||
        !decimal(input.baseFee) ||
        !validMoneyInput(input.baseFee, input.currency))
    )
      return null;
    const resource = isZone ? "zones" : "plans";
    return {
      path: `merchant-pricing/${resource}${value.id ? `/${value.id}` : ""}`,
      method: value.id ? "PATCH" : "POST",
      body: input,
    };
  }
  if (
    value.kind === "tariff" &&
    pricingId(value.id) &&
    pricingId(value.zoneId) &&
    only(value, ["kind", "id", "zoneId", "input"]) &&
    only(input, [
      "revision",
      "fee",
      "discount",
      "promotionDiscount",
      "promotionLabel",
    ]) &&
    revision(input.revision) &&
    decimal(input.fee) &&
    decimal(input.discount) &&
    decimal(input.promotionDiscount) &&
    (input.promotionLabel === undefined || text(input.promotionLabel, 200))
  )
    return {
      path: `merchant-pricing/plans/${value.id}/tariffs/${value.zoneId}`,
      method: "PUT",
      body: input,
    };
  if (
    value.kind === "assignment" &&
    pricingId(value.id) &&
    only(value, ["kind", "id", "input"]) &&
    only(input, ["planId", "revision", "discountAmount"]) &&
    pricingId(input.planId) &&
    revision(input.revision) &&
    decimal(input.discountAmount)
  )
    return {
      path: `merchant-pricing/merchants/${value.id}/plan`,
      method: "PUT",
      body: input,
    };
  return null;
}
export function parsePlan(value: unknown, companyId: string): Plan | null {
  if (
    !object(value) ||
    !pricingId(value.id) ||
    value.companyId !== companyId ||
    !text(value.name, 150) ||
    !currency(value.currency) ||
    typeof value.active !== "boolean" ||
    !revision(value.revision)
  )
    return null;
  return {
    id: value.id,
    companyId,
    name: value.name,
    currency: value.currency,
    active: value.active,
    revision: value.revision,
  };
}
export function parseZone(value: unknown, companyId: string): Zone | null {
  const plan = parsePlan(value, companyId);
  return plan &&
    object(value) &&
    text(value.city, 100) &&
    decimal(value.baseFee) &&
    validMoneyInput(value.baseFee, plan.currency)
    ? { ...plan, city: value.city, baseFee: value.baseFee }
    : null;
}
function parseTariff(
  value: unknown,
  companyId: string,
  plan: Plan,
): Tariff | null {
  if (
    !object(value) ||
    !pricingId(value.id) ||
    value.companyId !== companyId ||
    value.planId !== plan.id ||
    !pricingId(value.zoneId) ||
    !decimal(value.fee) ||
    !decimal(value.discount) ||
    !decimal(value.promotionDiscount) ||
    ![value.fee, value.discount, value.promotionDiscount].every((amount) =>
      validMoneyInput(amount, plan.currency),
    ) ||
    !(value.promotionLabel === null || typeof value.promotionLabel === "string")
  )
    return null;
  return {
    id: value.id,
    companyId,
    planId: plan.id,
    zoneId: value.zoneId,
    zoneName: typeof value.zoneName === "string" ? value.zoneName : null,
    city: typeof value.city === "string" ? value.city : null,
    fee: value.fee,
    discount: value.discount,
    promotionDiscount: value.promotionDiscount,
    promotionLabel: value.promotionLabel,
  };
}
function parsePage<T>(
  value: Record<string, unknown>,
  parser: (row: unknown) => T | null,
): PricingPage<T> | null {
  if (
    !Array.isArray(value.items) ||
    value.items.length > 100 ||
    !revision(value.page) ||
    !revision(value.pageSize) ||
    value.pageSize > 100 ||
    typeof value.hasNext !== "boolean"
  )
    return null;
  const items: T[] = [];
  for (const row of value.items) {
    const item = parser(row);
    if (!item) return null;
    items.push(item);
  }
  return {
    items,
    page: value.page,
    pageSize: value.pageSize,
    hasNext: value.hasNext,
  };
}
export function parsePricingData(
  operation: PricingOperation,
  value: Record<string, unknown>,
  companyId: string,
): PricingData | null {
  if (operation.kind === "zones") {
    const page = parsePage(value, (row) => parseZone(row, companyId));
    return page ? { kind: "zones", page } : null;
  }
  if (operation.kind === "plans") {
    const page = parsePage(value, (row) => parsePlan(row, companyId));
    return page ? { kind: "plans", page } : null;
  }
  if (operation.kind === "plan") {
    const plan = parsePlan(value.plan, companyId);
    if (!plan || plan.id !== operation.id || !Array.isArray(value.tariffs))
      return null;
    const tariffs: Tariff[] = [];
    for (const row of value.tariffs) {
      const tariff = parseTariff(row, companyId, plan);
      if (!tariff) return null;
      tariffs.push(tariff);
    }
    return { kind: "plan", plan, tariffs };
  }
  return null;
}
export function confirmedPricingMutation(
  operation: PricingOperation,
  value: Record<string, unknown>,
  companyId: string,
) {
  if (operation.kind === "save-zone") {
    const zone = parseZone(value.zone, companyId);
    return !!zone && (!operation.id || zone.id === operation.id);
  }
  if (operation.kind === "save-plan") {
    const plan = parsePlan(value.plan, companyId);
    return !!plan && (!operation.id || plan.id === operation.id);
  }
  if (operation.kind === "tariff")
    return (
      value.planId === operation.id &&
      revision(value.revision) &&
      object(value.tariff) &&
      value.tariff.planId === operation.id &&
      value.tariff.zoneId === operation.zoneId &&
      value.tariff.companyId === companyId
    );
  if (operation.kind === "assignment")
    return (
      value.merchantId === operation.id &&
      value.planId === operation.input.planId &&
      revision(value.revision) &&
      decimal(value.discountAmount)
    );
  return false;
}
