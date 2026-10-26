export interface OverviewCurrencySnapshot {
  currency: string;
  codPending: string;
  codCollected: string;
  merchantDuesPending: string;
}

export interface OverviewResponse {
  companyId: string;
  generatedAt: string;
  timeZone: 'UTC';
  kpis: {
    totalParcels: number;
    inWarehouse: number;
    outForDelivery: number;
    deliveredToday: number;
    returnsCount: number;
    pickupRequestsPending: number;
    settlementsPending: number;
  };
  parcelsByStatus: { status: string; count: number }[];
  parcelActivityLast7Days: {
    date: string;
    created: number;
    delivered: number;
    returned: number;
  }[];
  deliveryPerformance: {
    delivered: number;
    failedOrReturned: number;
    inProgress: number;
    cancelled: number;
  };
  financeSnapshot: {
    currencies: OverviewCurrencySnapshot[];
    settlementRequestsPending: number;
  };
}
