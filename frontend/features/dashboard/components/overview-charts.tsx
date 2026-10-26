"use client";

import { useId, type ReactNode } from "react";
import { BarChart3, PackageOpen, type LucideIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { displayMoney } from "@/features/operations/money";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import type { OverviewStats } from "../overview-contract";
import styles from "./overview-charts.module.css";

type ParcelStatus = OverviewStats["parcelsByStatus"][number]["status"];
type Finance = OverviewStats["financeSnapshot"]["currencies"][number];

const statusLabels: Record<ParcelStatus, TranslationKey> = {
  CREATED: "Created",
  READY_FOR_DISPATCH: "Ready for dispatch",
  ASSIGNED: "Assigned to driver",
  PICKED_UP: "Picked up",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  FAILED_DELIVERY: "Delivery failed",
  RESCHEDULED: "Rescheduled",
  RETURNED: "Returned",
  ON_HOLD: "On hold",
  RECEIVED_FROM_MERCHANT: "Received from merchant",
  AT_WAREHOUSE: "At warehouse",
  RETURN_IN_PROGRESS: "Return in progress",
  RETURNED_TO_WAREHOUSE: "Returned to warehouse",
  RETURNED_TO_MERCHANT: "Returned to merchant",
};

const statusFills: Record<ParcelStatus, string> = {
  CREATED: "var(--muted-foreground)",
  READY_FOR_DISPATCH: "var(--primary)",
  ASSIGNED: "var(--brand-navy)",
  PICKED_UP: "var(--primary)",
  OUT_FOR_DELIVERY: "var(--primary-hover)",
  DELIVERED: "var(--primary)",
  CANCELLED: "var(--muted-foreground)",
  FAILED_DELIVERY: "var(--muted-foreground)",
  RESCHEDULED: "var(--muted-foreground)",
  RETURNED: "var(--muted-foreground)",
  ON_HOLD: "var(--muted-foreground)",
  RECEIVED_FROM_MERCHANT: "var(--primary)",
  AT_WAREHOUSE: "var(--brand-navy)",
  RETURN_IN_PROGRESS: "var(--muted-foreground)",
  RETURNED_TO_WAREHOUSE: "var(--muted-foreground)",
  RETURNED_TO_MERCHANT: "var(--muted-foreground)",
};

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  color: "var(--foreground)",
  fontSize: 12,
  lineHeight: "20px",
  padding: "10px 12px",
};

function ChartCard({
  title,
  description,
  children,
}: {
  title: TranslationKey;
  description: TranslationKey;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col rounded-lg border bg-surface p-5 shadow-sm sm:p-6">
      <h3 id={headingId} className="text-base font-semibold leading-6 text-brand-navy">{t(title)}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t(description)}</p>
      {children}
    </section>
  );
}

function EmptyChart({ title, description, icon: Icon = BarChart3 }: {
  title: TranslationKey;
  description: TranslationKey;
  icon?: LucideIcon;
}) {
  const { t } = useLocale();
  return (
    <div className="flex min-h-72 flex-1 flex-col items-center justify-center px-4 py-8 text-center">
      <Icon aria-hidden="true" className="size-6 text-muted-foreground" />
      <p className="mt-4 text-sm font-medium text-foreground">{t(title)}</p>
      <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">{t(description)}</p>
    </div>
  );
}

function StatusDistribution({ data }: { data: OverviewStats }) {
  const { t, locale } = useLocale();
  const number = new Intl.NumberFormat(locale);
  const statuses = data.parcelsByStatus.filter((entry) => entry.count > 0).map((entry) => ({
    ...entry,
    name: t(statusLabels[entry.status]),
    fill: statusFills[entry.status],
  }));
  return (
    <ChartCard title="Parcels by status" description="Current distribution across your company">
      {statuses.length ? (
        <div className="mt-5 grid flex-1 items-center gap-5 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className={`${styles.chart} relative mx-auto h-60 w-full max-w-64`}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart accessibilityLayer aria-label={t("Parcels by status")}>
                <Pie data={statuses} dataKey="count" nameKey="name" innerRadius="68%" outerRadius="88%" stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
                  {statuses.map((entry) => <Cell key={entry.status} fill={entry.fill} />)}
                </Pie>
                <Tooltip formatter={(value) => typeof value === "number" ? number.format(value) : value} contentStyle={tooltipStyle} itemStyle={{ color: "var(--foreground)" }} isAnimationActive={false} />
              </PieChart>
            </ResponsiveContainer>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
              <span className="max-w-full break-all text-2xl font-semibold leading-8 tracking-tight text-brand-navy tabular-nums">{number.format(data.kpis.totalParcels)}</span>
              <span className="mt-1 text-xs leading-5 text-muted-foreground">{t("Total parcels")}</span>
            </div>
          </div>
          <dl aria-label={t("Parcels by status")} tabIndex={0} className="max-h-72 space-y-3 overflow-y-auto rounded-sm pe-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {statuses.map((entry) => (
              <div key={entry.status} className="flex items-start justify-between gap-3 text-xs leading-5">
                <dt className="flex min-w-0 items-start gap-2">
                  <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: entry.fill }} />
                  <span>{entry.name}</span>
                </dt>
                <dd className="shrink-0 font-semibold text-brand-navy tabular-nums">{number.format(entry.count)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : <EmptyChart title="No parcel activity yet" description="Your parcel distribution will appear as parcels are recorded." icon={PackageOpen} />}
    </ChartCard>
  );
}

function DailyActivity({ data }: { data: OverviewStats }) {
  const { t, locale } = useLocale();
  const number = new Intl.NumberFormat(locale);
  const shortNumber = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const shortDate = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: data.timeZone });
  const fullDate = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: data.timeZone });
  const days = data.parcelActivityLast7Days;
  const hasActivity = days.some((day) => day.created > 0 || day.delivered > 0);
  const rtl = locale === "ar";

  return (
    <ChartCard title="Daily parcel activity" description="Created and delivered over the last 7 days · UTC">
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs leading-5">
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-sm bg-brand-navy" />{t("Parcels created")}</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-sm bg-primary-hover" />{t("Parcels delivered")}</span>
      </div>
      {hasActivity ? (
        <div className={`${styles.chart} mt-5 h-60 min-w-0`} dir="ltr">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={days} accessibilityLayer aria-label={t("Daily parcel activity")} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="25%" barGap={3}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(date: string) => shortDate.format(new Date(`${date}T00:00:00Z`))} reversed={rtl} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickMargin={12} minTickGap={8} height={40} />
              <YAxis orientation={rtl ? "right" : "left"} allowDecimals={false} width={40} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickFormatter={(value: number) => shortNumber.format(value)} />
              <Tooltip
                formatter={(value) => typeof value === "number" ? number.format(value) : value}
                labelFormatter={(date) => typeof date === "string" ? fullDate.format(new Date(`${date}T00:00:00Z`)) : date}
                contentStyle={tooltipStyle}
                itemStyle={{ color: "var(--foreground)" }}
                wrapperStyle={{ direction: rtl ? "rtl" : "ltr" }}
                cursor={{ fill: "var(--surface-secondary)" }}
                isAnimationActive={false}
              />
              <Bar dataKey="created" name={t("Parcels created")} fill="var(--brand-navy)" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} />
              <Bar dataKey="delivered" name={t("Parcels delivered")} fill="var(--primary-hover)" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : <EmptyChart title={days.some((day) => day.returned > 0) ? "No new parcels or deliveries in the last 7 days" : "No parcel activity in the last 7 days"} description="New parcels and confirmed deliveries will appear here." />}
      <details className="mt-4 border-t pt-3">
        <summary className="w-fit cursor-pointer rounded-sm text-xs font-medium leading-6 text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">{t("View daily activity data")}</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-start text-xs leading-5 tabular-nums">
            <caption className="sr-only">{t("Daily parcel activity")}</caption>
            <thead><tr className="border-b text-muted-foreground">
              <th scope="col" className="py-2 pe-3 text-start font-medium">{t("Activity date")}</th>
              <th scope="col" className="px-2 py-2 text-end font-medium">{t("Parcels created")}</th>
              <th scope="col" className="px-2 py-2 text-end font-medium">{t("Parcels delivered")}</th>
              <th scope="col" className="py-2 ps-2 text-end font-medium">{t("Return handoffs")}</th>
            </tr></thead>
            <tbody>{days.map((day) => (
              <tr key={day.date} className="border-b last:border-b-0">
                <th scope="row" className="whitespace-nowrap py-2 pe-3 text-start font-medium">{fullDate.format(new Date(`${day.date}T00:00:00Z`))}</th>
                <td className="px-2 py-2 text-end">{number.format(day.created)}</td>
                <td className="px-2 py-2 text-end">{number.format(day.delivered)}</td>
                <td className="py-2 ps-2 text-end">{number.format(day.returned)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </ChartCard>
  );
}

function DeliveryPerformance({ data }: { data: OverviewStats }) {
  const { t, locale } = useLocale();
  const number = new Intl.NumberFormat(locale);
  const rtl = locale === "ar";
  const rows = [
    { name: t("Delivered"), count: data.deliveryPerformance.delivered, fill: "var(--primary-hover)" },
    { name: t("Failed / returned"), count: data.deliveryPerformance.failedOrReturned, fill: "var(--muted-foreground)" },
    { name: t("In progress"), count: data.deliveryPerformance.inProgress, fill: "var(--brand-navy)" },
  ];
  const hasOutcomes = rows.some((row) => row.count > 0);
  return (
    <ChartCard title="Delivery & return performance" description="Current outcomes across all recorded parcels">
      {hasOutcomes ? (
        <>
          <div className={`${styles.chart} mt-6 h-56 min-w-0`} dir="ltr">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={rows} layout="vertical" accessibilityLayer aria-label={t("Delivery & return performance")} margin={{ top: 4, right: rtl ? 0 : 40, bottom: 4, left: rtl ? 40 : 0 }}>
                <XAxis type="number" hide reversed={rtl} domain={[0, (maximum: number) => Math.max(1, maximum)]} />
                <YAxis type="category" dataKey="name" width={112} orientation={rtl ? "right" : "left"} axisLine={false} tickLine={false} tick={{ fill: "var(--foreground)", fontSize: 12 }} />
                <Tooltip formatter={(value) => [typeof value === "number" ? number.format(value) : value, t("Parcels")]} contentStyle={tooltipStyle} itemStyle={{ color: "var(--foreground)" }} wrapperStyle={{ direction: rtl ? "rtl" : "ltr" }} cursor={{ fill: "var(--surface-secondary)" }} isAnimationActive={false} />
                <Bar dataKey="count" name={t("Parcels")} barSize={24} radius={3} background={{ fill: "var(--surface-secondary)", radius: 3 }} isAnimationActive={false}>
                  {rows.map((row) => <Cell key={row.name} fill={row.fill} />)}
                  {/* Recharts follows the signed bar width, so "right" also labels the end of a reversed bar. */}
                  <LabelList dataKey="count" position="right" formatter={(value) => typeof value === "number" ? number.format(value) : ""} fill="var(--foreground)" fontSize={12} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <dl className="sr-only">{rows.map((row) => <div key={row.name}><dt>{row.name}</dt><dd>{number.format(row.count)}</dd></div>)}</dl>
        </>
      ) : <EmptyChart title="No delivery outcomes yet" description="Delivery progress will appear as parcels move through operations." />}
      <p className="mt-auto border-t pt-4 text-xs leading-5 text-muted-foreground">{t("{count} cancelled parcels excluded from delivery outcomes", { count: number.format(data.deliveryPerformance.cancelled) })}</p>
    </ChartCard>
  );
}

function FinancialSummary({ data, finance }: { data: OverviewStats; finance: Finance | null }) {
  const { t, locale } = useLocale();
  const number = new Intl.NumberFormat(locale);
  const amount = (field: "codPending" | "codCollected" | "merchantDuesPending") => finance ? displayMoney(finance[field], finance.currency, locale) : number.format(0);
  const isZero = (field: "codPending" | "codCollected" | "merchantDuesPending") => !finance || /^-?0(?:\.0+)?$/.test(finance[field]);
  const metrics: { label: TranslationKey; value: string; description: TranslationKey }[] = [
    { label: "COD pending collection", value: amount("codPending"), description: isZero("codPending") ? "No COD collections pending" : "Goods value awaiting collection" },
    { label: "COD collected", value: amount("codCollected"), description: isZero("codCollected") ? "No COD collections recorded" : "Recorded goods collections" },
    { label: "Merchant dues pending", value: amount("merchantDuesPending"), description: isZero("merchantDuesPending") ? "No merchant balance outstanding" : "Net merchant balance after payments" },
    { label: "Settlement requests awaiting review", value: number.format(data.financeSnapshot.settlementRequestsPending), description: data.financeSnapshot.settlementRequestsPending ? "Merchant requests awaiting a decision" : "No settlement requests awaiting review" },
  ];
  return (
    <ChartCard title="COD & financial snapshot" description="Collection, merchant balances and settlement requests">
      <dl className="my-5 grid flex-1 grid-cols-1 gap-x-6 sm:grid-cols-2">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 border-b py-4 sm:odd:pe-2">
            <dt className="text-xs font-medium leading-5 text-foreground">{t(metric.label)}</dt>
            <dd className="mt-2 break-all text-xl font-semibold leading-8 tracking-tight text-brand-navy tabular-nums"><bdi>{metric.value}</bdi></dd>
            <dd className="mt-1 text-xs leading-5 text-muted-foreground">{t(metric.description)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-5 text-muted-foreground">{finance ? t("Amounts shown in {currency}; currencies are kept separate.", { currency: finance.currency }) : t("No financial activity recorded yet")}</p>
    </ChartCard>
  );
}

export function OverviewCharts({ data, finance }: { data: OverviewStats; finance: Finance | null }) {
  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      <StatusDistribution data={data} />
      <DailyActivity data={data} />
      <DeliveryPerformance data={data} />
      <FinancialSummary data={data} finance={finance} />
    </div>
  );
}
