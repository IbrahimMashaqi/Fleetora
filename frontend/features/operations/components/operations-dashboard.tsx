"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { useOperations } from "../use-operations";
import type { Scope } from "../operations-contract";
import { OperationsWorkspace, PageIntro } from "./operations-workspace";
import {
  DataTable,
  DateTime,
  Money,
  Panel,
  ReadState,
  StateLabel,
  StatusBadge,
  valueText,
} from "./operations-ui";
import { DirectoryFilters } from "./operations-directory";

const metrics: Record<string, { label: TranslationKey; status?: string }> = {
  total: { label: "Total parcels" },
  new: { label: "New parcels", status: "CREATED" },
  atWarehouse: { label: "Warehouse parcels", status: "AT_WAREHOUSE" },
  assigned: { label: "Assigned parcels", status: "ASSIGNED" },
  outForDelivery: { label: "Out for delivery", status: "OUT_FOR_DELIVERY" },
  delivered: { label: "Delivered parcels", status: "DELIVERED" },
  failedDeliveries: { label: "Failed deliveries", status: "FAILED_DELIVERY" },
  pendingReturns: { label: "Pending returns" },
  returnedToMerchant: {
    label: "Returned to merchant",
    status: "RETURNED_TO_MERCHANT",
  },
  overdue: { label: "Overdue parcels" },
};
export function OperationsDashboard({
  query,
}: {
  query: Record<string, string>;
}) {
  return (
    <OperationsWorkspace>
      {(scope) => (
        <Dashboard
          key={JSON.stringify([scope, query])}
          scope={scope}
          query={query}
        />
      )}
    </OperationsWorkspace>
  );
}
function Dashboard({
  scope,
  query,
}: {
  scope: Scope;
  query: Record<string, string>;
}) {
  const { t, locale } = useLocale();
  const dashboard = useOperations(scope, { resource: "dashboard", query });
  return (
    <>
      <PageIntro title="Parcel operations">
        <Button asChild variant="outline">
          <Link href="/app/parcels">{t("Parcels")}</Link>
        </Button>
        <Button variant="outline" onClick={dashboard.retry}>
          {t("Refresh")}
        </Button>
      </PageIntro>
      <DirectoryFilters resource="dashboard" scope={scope} query={query} />
      <ReadState result={dashboard.result} retry={dashboard.retry}>
        {(data) =>
          data.kind === "dashboard" ? (
            <div className="space-y-6">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {Object.entries(metrics).map(([key, metric]) => (
                  <div key={key} className="relative rounded-lg border bg-surface p-4 transition-colors hover:border-primary/50 focus-within:border-primary focus-within:outline-2 focus-within:outline-primary motion-reduce:transition-none">
                    <dt className="text-xs leading-5 text-muted-foreground">
                      {t(metric.label)}
                    </dt>
                    <dd className="mt-3 text-2xl font-semibold leading-8 tabular-nums">
                      <Link
                        aria-label={`${t(metric.label)}: ${data.counts[key]?.toLocaleString(locale) ?? "—"}`}
                        href={
                          key === "pendingReturns"
                            ? "/app/returns"
                            : `/app/parcels${metric.status ? `?status=${metric.status}` : ""}`
                        }
                        className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none"
                      >
                        {data.counts[key]?.toLocaleString(locale) ?? "—"}
                      </Link>
                    </dd>
                  </div>
                ))}
              </dl>
              <Panel title="Needs attention">
                <DataTable
                  items={data.attention}
                  columns={[
                    {
                      label: "Tracking number",
                      render: (row) => (
                        <Link
                          href={`/app/parcels/${row.id}`}
                          className="text-primary-hover underline"
                        >
                          <bdi dir="ltr">
                            {valueText(row, "trackingNumber")}
                          </bdi>
                        </Link>
                      ),
                    },
                    {
                      label: "Recipient",
                      render: (row) => valueText(row, "recipientName"),
                    },
                    {
                      label: "Status",
                      render: (row) => (
                        <StatusBadge value={valueText(row, "status")} />
                      ),
                    },
                    {
                      label: "Scheduled delivery",
                      render: (row) => <DateTime value={row.scheduledAt} />,
                    },
                  ]}
                />
              </Panel>
              <Panel title="Balances by currency">
                <DataTable
                  items={data.money.map((row) => ({
                    ...row,
                    id: valueText(row, "currency"),
                  }))}
                  columns={[
                    {
                      label: "Currency",
                      render: (row) => valueText(row, "currency"),
                    },
                    {
                      label: "Expected COD",
                      render: (row) => <Money row={row} field="expectedCod" />,
                    },
                    {
                      label: "Collected COD",
                      render: (row) => <Money row={row} field="collectedCod" />,
                    },
                    {
                      label: "Uncollected COD",
                      render: (row) => (
                        <Money row={row} field="uncollectedCod" />
                      ),
                    },
                    {
                      label: "Unremitted driver cash",
                      render: (row) => (
                        <Money row={row} field="unremittedCash" />
                      ),
                    },
                    {
                      label: "Merchant payables",
                      render: (row) => (
                        <Money row={row} field="merchantPayables" />
                      ),
                    },
                    {
                      label: "Settled merchant amounts",
                      render: (row) => (
                        <Money row={row} field="settledAmounts" />
                      ),
                    },
                  ]}
                />
              </Panel>
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="Status distribution">
                  <ul className="space-y-3">
                    {Object.entries(data.statusDistribution).map(
                      ([status, count]) => (
                        <li
                          className="flex items-center justify-between gap-3"
                          key={status}
                        >
                          <StatusBadge value={status} />
                          <span className="text-sm tabular-nums">
                            {count.toLocaleString(locale)}
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                  {!Object.keys(data.statusDistribution).length && (
                    <p className="text-sm text-muted-foreground">
                      {t("No operational records yet.")}
                    </p>
                  )}
                </Panel>
                <Panel title="Recent activity">
                  <ol className="space-y-4">
                    {data.recentActivity.map((event) => (
                      <li
                        className="border-s-2 border-border ps-3"
                        key={event.id}
                      >
                        <Link
                          className="text-sm text-primary-hover underline"
                          href={`/app/parcels/${valueText(event, "shipmentId")}`}
                        >
                          <StateLabel value={valueText(event, "toStatus")} />
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <DateTime value={event.occurredAt} />
                        </p>
                      </li>
                    ))}
                  </ol>
                  {!data.recentActivity.length && (
                    <p className="text-sm text-muted-foreground">
                      {t("No activity recorded.")}
                    </p>
                  )}
                </Panel>
              </div>
              <Panel title="Pending returns">
                <DataTable
                  items={data.pendingReturns}
                  columns={[
                    {
                      label: "Tracking number",
                      render: (row) => (
                        <Link
                          className="text-primary-hover underline"
                          href={`/app/parcels/${valueText(row, "shipmentId")}`}
                        >
                          {t("Parcel details")}
                        </Link>
                      ),
                    },
                    {
                      label: "Return reason",
                      render: (row) => (
                        <StateLabel value={valueText(row, "reason")} />
                      ),
                    },
                    {
                      label: "Status",
                      render: (row) => (
                        <StatusBadge value={valueText(row, "status")} />
                      ),
                    },
                    {
                      label: "Recorded at",
                      render: (row) => <DateTime value={row.createdAt} />,
                    },
                  ]}
                />
              </Panel>
            </div>
          ) : null
        }
      </ReadState>
    </>
  );
}
