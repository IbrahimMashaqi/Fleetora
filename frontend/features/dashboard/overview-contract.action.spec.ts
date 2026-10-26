import { expect, test } from "@playwright/test";
import { emptyOverviewFixture, overviewFixture } from "@/tests/fixtures/overview";
import { parseOverviewStats } from "./overview-contract";

test("accepts current scoped overview and strips unrelated fields at every level", () => {
  const fixture = overviewFixture();
  const result = parseOverviewStats({
    ...fixture,
    passwordHash: "private",
    kpis: { ...fixture.kpis, secret: "private" },
    parcelsByStatus: fixture.parcelsByStatus.map((row) => ({ ...row, secret: "private" })),
    parcelActivityLast7Days: fixture.parcelActivityLast7Days.map((row) => ({ ...row, secret: "private" })),
    deliveryPerformance: { ...fixture.deliveryPerformance, secret: "private" },
    financeSnapshot: {
      ...fixture.financeSnapshot,
      secret: "private",
      currencies: fixture.financeSnapshot.currencies.map((row) => ({ ...row, secret: "private" })),
    },
  }, "company-a");
  expect(result).toEqual(fixture);
  expect(JSON.stringify(result)).not.toContain("private");
});

test("accepts empty aggregates as zero data and retains the seven date buckets", () => {
  const fixture = emptyOverviewFixture();
  expect(parseOverviewStats(fixture, "company-a")).toEqual(fixture);
});

test("preserves exact currency precision and signed merchant balances without rounding", () => {
  const fixture = overviewFixture();
  fixture.financeSnapshot.currencies[0].codPending = "123456789012345678901234567890.25";
  expect(parseOverviewStats(fixture, "company-a")).toEqual(fixture);
  expect(fixture.financeSnapshot.settlementRequestsPending).not.toBe(fixture.kpis.settlementsPending);
});

test("rejects foreign-company data and invalid envelope metadata", () => {
  const fixture = overviewFixture();
  for (const data of [null, [], {}, { ...fixture, companyId: "company-b" }, { ...fixture, timeZone: "Asia/Hebron" }, { ...fixture, generatedAt: "2026-02-30T12:00:00.000Z" }]) {
    expect(parseOverviewStats(data, "company-a")).toBeNull();
  }
});

test("rejects negative, fractional and unsafe counts rather than charting invalid totals", () => {
  const fixture = overviewFixture();
  for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, "10"])
    expect(parseOverviewStats({ ...fixture, kpis: { ...fixture.kpis, totalParcels: count } }, "company-a")).toBeNull();
  expect(parseOverviewStats({ ...fixture, deliveryPerformance: { ...fixture.deliveryPerformance, delivered: -1 } }, "company-a")).toBeNull();
});

test("rejects duplicate, unknown or incoherent status distributions", () => {
  const fixture = overviewFixture();
  for (const parcelsByStatus of [
    [...fixture.parcelsByStatus, fixture.parcelsByStatus[0]],
    [{ status: "UNKNOWN", count: 10 }],
    [{ status: "DELIVERED", count: 9 }],
    [{ status: "DELIVERED", count: 10 }, { status: "RETURNED", count: 0 }],
  ]) expect(parseOverviewStats({ ...fixture, parcelsByStatus }, "company-a")).toBeNull();
  expect(parseOverviewStats({ ...fixture, deliveryPerformance: { ...fixture.deliveryPerformance, delivered: 3 } }, "company-a")).toBeNull();
});

test("rejects missing, duplicate or out-of-window daily activity buckets", () => {
  const fixture = overviewFixture();
  const activities = fixture.parcelActivityLast7Days;
  for (const parcelActivityLast7Days of [
    activities.slice(1),
    activities.map((row, index) => index === 0 ? { ...row, date: "2026-10-20" } : row),
    activities.map((row, index) => index === 6 ? { ...row, date: "2026-10-26" } : row),
    activities.map((row, index) => index === 0 ? { ...row, date: "2026-02-30" } : row),
    activities.map((row, index) => index === 0 ? { ...row, returned: -1 } : row),
  ]) expect(parseOverviewStats({ ...fixture, parcelActivityLast7Days }, "company-a")).toBeNull();
  expect(parseOverviewStats({ ...fixture, kpis: { ...fixture.kpis, deliveredToday: 1 } }, "company-a")).toBeNull();
});

test("rejects unsupported, duplicate and malformed monetary values", () => {
  const fixture = overviewFixture();
  const ils = fixture.financeSnapshot.currencies[0];
  for (const currencies of [
    [ils, ils],
    [{ ...ils, currency: "GBP" }],
    [{ ...ils, codPending: "-1.00" }],
    [{ ...ils, codCollected: "5.001" }],
    [{ ...ils, merchantDuesPending: "1e9" }],
    [{ ...ils, codPending: 10 }],
    [{ ...ils, currency: "JOD", codPending: "1.00" }],
  ]) expect(parseOverviewStats({ ...fixture, financeSnapshot: { ...fixture.financeSnapshot, currencies } }, "company-a")).toBeNull();
});
