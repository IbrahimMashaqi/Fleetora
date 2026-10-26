import { currency as isCurrency, type Currency } from "@/features/merchant-pricing/pricing-contract";

export type { Currency } from "@/features/merchant-pricing/pricing-contract";

export const overviewParcelStatuses = [
  "CREATED", "READY_FOR_DISPATCH", "ASSIGNED", "PICKED_UP",
  "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "FAILED_DELIVERY",
  "RESCHEDULED", "RETURNED", "ON_HOLD", "RECEIVED_FROM_MERCHANT",
  "AT_WAREHOUSE", "RETURN_IN_PROGRESS", "RETURNED_TO_WAREHOUSE", "RETURNED_TO_MERCHANT",
] as const;

export type OverviewParcelStatus = (typeof overviewParcelStatuses)[number];
export type OverviewScope = { userId: string; companyId: string };
export type OverviewFailure = "unavailable" | "forbidden" | "changed" | "unauthenticated";
export type OverviewResult = { status: "ready"; data: OverviewStats } | { status: OverviewFailure };
export type OverviewCurrencySnapshot = {
  currency: Currency;
  codPending: string;
  codCollected: string;
  merchantDuesPending: string;
};
export type OverviewStats = {
  companyId: string;
  generatedAt: string;
  timeZone: "UTC";
  kpis: {
    totalParcels: number;
    inWarehouse: number;
    outForDelivery: number;
    deliveredToday: number;
    returnsCount: number;
    pickupRequestsPending: number;
    settlementsPending: number;
  };
  parcelsByStatus: { status: OverviewParcelStatus; count: number }[];
  parcelActivityLast7Days: { date: string; created: number; delivered: number; returned: number }[];
  deliveryPerformance: { delivered: number; failedOrReturned: number; inProgress: number; cancelled: number };
  financeSnapshot: { currencies: OverviewCurrencySnapshot[]; settlementRequestsPending: number };
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parcelStatus(value: unknown): value is OverviewParcelStatus {
  return overviewParcelStatuses.some((status) => status === value);
}

function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = Date.parse(value);
  return Number.isFinite(date) && new Date(date).toISOString() === value;
}

function money(value: unknown, currency: Currency, signed = false): value is string {
  return typeof value === "string" && new RegExp(
    `^${signed ? "-?" : ""}(?:0|[1-9][0-9]{0,63})\\.[0-9]{${currency === "JOD" ? 3 : 2}}$`,
  ).test(value);
}

function parseKpis(value: unknown): OverviewStats["kpis"] | null {
  if (!record(value)) return null;
  const { totalParcels, inWarehouse, outForDelivery, deliveredToday, returnsCount, pickupRequestsPending, settlementsPending } = value;
  if (!count(totalParcels) || !count(inWarehouse) || !count(outForDelivery) ||
    !count(deliveredToday) || !count(returnsCount) || !count(pickupRequestsPending) || !count(settlementsPending)) return null;
  return { totalParcels, inWarehouse, outForDelivery, deliveredToday, returnsCount, pickupRequestsPending, settlementsPending };
}

function parseStatusCounts(value: unknown): OverviewStats["parcelsByStatus"] | null {
  if (!Array.isArray(value) || value.length > overviewParcelStatuses.length) return null;
  const seen = new Set<OverviewParcelStatus>();
  const result: OverviewStats["parcelsByStatus"] = [];
  for (const row of value) {
    if (!record(row) || !parcelStatus(row.status) || !count(row.count) || row.count === 0 || seen.has(row.status)) return null;
    seen.add(row.status);
    result.push({ status: row.status, count: row.count });
  }
  return result;
}

function parseActivity(value: unknown, generatedAt: string): OverviewStats["parcelActivityLast7Days"] | null {
  if (!Array.isArray(value) || value.length !== 7) return null;
  const today = Date.parse(`${generatedAt.slice(0, 10)}T00:00:00.000Z`);
  const result: OverviewStats["parcelActivityLast7Days"] = [];
  for (const [index, row] of value.entries()) {
    const expectedDate = new Date(today - (6 - index) * 86_400_000).toISOString().slice(0, 10);
    if (!record(row) || row.date !== expectedDate || !count(row.created) || !count(row.delivered) || !count(row.returned)) return null;
    result.push({ date: expectedDate, created: row.created, delivered: row.delivered, returned: row.returned });
  }
  return result;
}

function parsePerformance(value: unknown): OverviewStats["deliveryPerformance"] | null {
  if (!record(value)) return null;
  const { delivered, failedOrReturned, inProgress, cancelled } = value;
  if (!count(delivered) || !count(failedOrReturned) || !count(inProgress) || !count(cancelled)) return null;
  return { delivered, failedOrReturned, inProgress, cancelled };
}

function parseFinance(value: unknown): OverviewStats["financeSnapshot"] | null {
  if (!record(value) || !Array.isArray(value.currencies) || value.currencies.length > 4 || !count(value.settlementRequestsPending)) return null;
  const seen = new Set<Currency>();
  const currencies: OverviewCurrencySnapshot[] = [];
  for (const row of value.currencies) {
    if (!record(row) || !isCurrency(row.currency) || seen.has(row.currency) ||
      !money(row.codPending, row.currency) || !money(row.codCollected, row.currency) || !money(row.merchantDuesPending, row.currency, true)) return null;
    seen.add(row.currency);
    currencies.push({ currency: row.currency, codPending: row.codPending, codCollected: row.codCollected, merchantDuesPending: row.merchantDuesPending });
  }
  return { currencies, settlementRequestsPending: value.settlementRequestsPending };
}

/** Validate and project only the authenticated company's published aggregate contract. */
export function parseOverviewStats(value: unknown, companyId: string): OverviewStats | null {
  if (!record(value) || !companyId || value.companyId !== companyId || value.timeZone !== "UTC" || !timestamp(value.generatedAt)) return null;
  const kpis = parseKpis(value.kpis);
  const parcelsByStatus = parseStatusCounts(value.parcelsByStatus);
  const parcelActivityLast7Days = parseActivity(value.parcelActivityLast7Days, value.generatedAt);
  const deliveryPerformance = parsePerformance(value.deliveryPerformance);
  const financeSnapshot = parseFinance(value.financeSnapshot);
  if (!kpis || !parcelsByStatus || !parcelActivityLast7Days || !deliveryPerformance || !financeSnapshot) return null;
  if (parcelsByStatus.reduce((total, row) => total + row.count, 0) !== kpis.totalParcels ||
    Object.values(deliveryPerformance).reduce((total, amount) => total + amount, 0) !== kpis.totalParcels ||
    parcelActivityLast7Days[6].delivered !== kpis.deliveredToday) return null;
  return { companyId, generatedAt: value.generatedAt, timeZone: "UTC", kpis, parcelsByStatus, parcelActivityLast7Days, deliveryPerformance, financeSnapshot };
}
