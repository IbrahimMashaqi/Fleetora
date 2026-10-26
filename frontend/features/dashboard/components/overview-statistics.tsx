"use client";

import { useId, useState, type ReactNode } from "react";
import {
  Banknote,
  CircleAlert,
  CircleCheck,
  Package,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayMoney } from "@/features/operations/money";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import type { OverviewStats } from "../overview-contract";
import { OverviewCharts } from "./overview-charts";

type OverviewStatisticsProps = {
  data: OverviewStats | null;
  loading: boolean;
  error: "unavailable" | "forbidden" | "changed" | null;
  onRetry: () => void;
};

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  money = false,
}: {
  label: TranslationKey;
  value: ReactNode;
  description: TranslationKey;
  icon: LucideIcon;
  money?: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="flex min-w-0 flex-col rounded-lg border bg-surface p-4 shadow-sm sm:p-5">
      <dt className="flex min-h-10 items-start justify-between gap-2 text-sm font-medium leading-5 text-foreground">
        <span>{t(label)}</span>
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      </dt>
      <dd className={`mt-3 break-all font-semibold leading-8 tracking-tight text-brand-navy tabular-nums ${money ? "text-xl" : "text-2xl"}`}>
        <bdi>{value}</bdi>
      </dd>
      <dd className="mt-2 text-xs leading-5 text-muted-foreground">{t(description)}</dd>
    </div>
  );
}

function OverviewSkeleton() {
  const { t } = useLocale();
  return (
    <div role="status" aria-label={t("Loading overview statistics...")}>
      <span className="sr-only">{t("Loading overview statistics...")}</span>
      <div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="min-h-44 rounded-lg border bg-surface p-4 sm:p-5">
              <div className="h-4 w-3/4 rounded-sm bg-border" />
              <div className="mt-7 h-8 w-1/2 rounded-sm bg-border" />
              <div className="mt-4 h-3 w-full rounded-sm bg-muted" />
            </div>
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="min-h-96 rounded-lg border bg-surface p-5 sm:p-6">
              <div className="h-5 w-1/2 rounded-sm bg-border" />
              <div className="mt-3 h-3 w-3/4 rounded-sm bg-muted" />
              <div className="mt-8 h-56 rounded-md bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OverviewStatistics({ data, loading, error, onRetry }: OverviewStatisticsProps) {
  const { t, locale } = useLocale();
  const headingId = useId();
  const currencyId = useId();
  const [selectedCurrency, setSelectedCurrency] = useState("");
  const currencies = data?.financeSnapshot.currencies ?? [];
  const finance = currencies.find((entry) => entry.currency === selectedCurrency) ?? currencies[0] ?? null;
  const number = new Intl.NumberFormat(locale);
  const money = finance ? displayMoney(finance.codPending, finance.currency, locale) : number.format(0);
  const codEmpty = !finance || /^-?0(?:\.0+)?$/.test(finance.codPending);
  const updated = data
    ? new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: data.timeZone }).format(new Date(data.generatedAt))
    : null;

  return (
    <section aria-labelledby={headingId} aria-busy={loading} className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold leading-7 tracking-tight text-brand-navy">{t("Company snapshot")}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("Parcels, collections and the work awaiting your team.")}</p>
          {updated && <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("Updated {time} · {zone}", { time: updated, zone: data?.timeZone ?? "UTC" })}</p>}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {currencies.length > 1 && finance && (
            <div className="space-y-1.5">
              <label htmlFor={currencyId} className="block text-xs font-medium text-muted-foreground">{t("Currency")}</label>
              <select
                id={currencyId}
                aria-label={t("Overview currency")}
                value={finance.currency}
                onChange={(event) => setSelectedCurrency(event.target.value)}
                disabled={loading}
                className="min-h-10 min-w-24 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {currencies.map(({ currency }) => <option key={currency} value={currency}>{currency}</option>)}
              </select>
            </div>
          )}
          {data && !error && (
            <Button variant="outline" onClick={onRetry} disabled={loading}>
              <RefreshCw aria-hidden="true" className={loading ? "motion-safe:animate-spin" : undefined} />
              {t("Refresh")}
            </Button>
          )}
        </div>
      </div>

      {loading ? <OverviewSkeleton /> : error ? (
        <div role="alert" className="flex flex-col items-start gap-4 rounded-lg border bg-surface p-5 shadow-sm sm:flex-row sm:p-6">
          <CircleAlert aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            <h3 className="text-base font-semibold text-brand-navy">{t("Statistics are temporarily unavailable")}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t(error === "forbidden" ? "Your account cannot perform this operation." : error === "changed" ? "Your company session changed. Reload before continuing." : "Your overview could not be loaded. Try again.")}
            </p>
          </div>
          <Button variant="outline" onClick={onRetry}><RefreshCw aria-hidden="true" />{t("Retry")}</Button>
        </div>
      ) : data ? (
        <>
          <dl aria-label={t("Overview statistics")} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <MetricCard label="Total parcels" value={number.format(data.kpis.totalParcels)} description={data.kpis.totalParcels ? "All recorded parcels" : "No parcels yet."} icon={Package} />
            <MetricCard label="In warehouse" value={number.format(data.kpis.inWarehouse)} description={data.kpis.inWarehouse ? "Currently at the warehouse" : "No parcels in the warehouse"} icon={Warehouse} />
            <MetricCard label="Out for delivery" value={number.format(data.kpis.outForDelivery)} description={data.kpis.outForDelivery ? "Currently on delivery routes" : "No parcels out for delivery"} icon={Truck} />
            <MetricCard label="Delivered today" value={number.format(data.kpis.deliveredToday)} description={data.kpis.deliveredToday ? "Confirmed deliveries today · UTC" : "No deliveries recorded today"} icon={CircleCheck} />
            <MetricCard label="Returns / failed deliveries" value={number.format(data.kpis.returnsCount)} description={data.kpis.returnsCount ? "Current failed deliveries and return stages" : "No returns or failed deliveries"} icon={RotateCcw} />
            <MetricCard label="COD pending collection" value={money} description={codEmpty ? "No COD collections pending" : "Goods value awaiting collection"} icon={Banknote} money />
            <MetricCard label="Merchant settlements pending" value={number.format(data.kpis.settlementsPending)} description={data.kpis.settlementsPending ? "Draft and approved settlements awaiting payment" : "No settlements pending"} icon={ReceiptText} />
            <MetricCard label="Pickup requests pending" value={number.format(data.kpis.pickupRequestsPending)} description={data.kpis.pickupRequestsPending ? "Requests awaiting parcel receipt" : "No pickup requests pending"} icon={PackageCheck} />
          </dl>
          <OverviewCharts data={data} finance={finance} />
        </>
      ) : <OverviewSkeleton />}
    </section>
  );
}
