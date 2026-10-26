import type { OverviewStats } from "@/features/dashboard/overview-contract";

/** Isolated test data only; the Overview runtime always reads the backend. */
export function overviewFixture(companyId = "company-a"): OverviewStats {
  return {
    companyId,
    generatedAt: "2026-10-25T12:00:00.000Z",
    timeZone: "UTC",
    kpis: {
      totalParcels: 10,
      inWarehouse: 2,
      outForDelivery: 3,
      deliveredToday: 2,
      returnsCount: 1,
      pickupRequestsPending: 4,
      settlementsPending: 2,
    },
    parcelsByStatus: [
      { status: "AT_WAREHOUSE", count: 2 },
      { status: "OUT_FOR_DELIVERY", count: 3 },
      { status: "DELIVERED", count: 4 },
      { status: "RETURNED", count: 1 },
    ],
    parcelActivityLast7Days: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-10-${19 + index}`,
      created: index === 6 ? 5 : 0,
      delivered: index === 6 ? 2 : 0,
      returned: index === 5 ? 1 : 0,
    })),
    deliveryPerformance: {
      delivered: 4,
      failedOrReturned: 1,
      inProgress: 5,
      cancelled: 0,
    },
    financeSnapshot: {
      currencies: [
        { currency: "ILS", codPending: "1234.50", codCollected: "960.00", merchantDuesPending: "720.00" },
        { currency: "JOD", codPending: "14.125", codCollected: "7.000", merchantDuesPending: "-2.750" },
      ],
      settlementRequestsPending: 3,
    },
  };
}

export function emptyOverviewFixture(companyId = "company-a"): OverviewStats {
  const fixture = overviewFixture(companyId);
  return {
    ...fixture,
    kpis: {
      totalParcels: 0,
      inWarehouse: 0,
      outForDelivery: 0,
      deliveredToday: 0,
      returnsCount: 0,
      pickupRequestsPending: 0,
      settlementsPending: 0,
    },
    parcelsByStatus: [],
    parcelActivityLast7Days: fixture.parcelActivityLast7Days.map(({ date }) => ({ date, created: 0, delivered: 0, returned: 0 })),
    deliveryPerformance: { delivered: 0, failedOrReturned: 0, inProgress: 0, cancelled: 0 },
    financeSnapshot: { currencies: [], settlementRequestsPending: 0 },
  };
}
