"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntityCombobox } from "./entity-combobox";
import { LocalizedDateInput } from "@/components/ui/localized-date-input";
import { Label } from "@/components/ui/label";
import { useDebouncedSearch } from "@/lib/use-debounced-search";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { useCompanyCurrency } from "@/features/auth/session/session-context";
import { useOperations } from "../use-operations";
import type {
  Data,
  Failure,
  Operation,
  Resource,
  Scope,
} from "../operations-contract";
import {
  OperationsWorkspace,
  PageIntro,
  type Permissions,
} from "./operations-workspace";
import {
  DataTable,
  DateTime,
  DetailLink,
  EntityPicker,
  Money,
  OperationDialog,
  Pager,
  ReadState,
  StateLabel,
  StatusBadge,
  valueNumber,
  valueText,
  type Column,
  type Field,
} from "./operations-ui";
import {
  merchantFields,
  parcelFields,
  paymentFields,
  returnReasonOptions,
} from "./operation-forms";

export type DirectoryResource =
  "merchants" | "parcels" | "returns" | "collections" | "settlements";
export const resourcePath: Record<DirectoryResource, string> = {
  merchants: "/app/merchants",
  parcels: "/app/parcels",
  returns: "/app/returns",
  collections: "/app/collections",
  settlements: "/app/settlements",
};
const titles: Record<DirectoryResource, TranslationKey> = {
  merchants: "Business merchants",
  parcels: "Parcels",
  returns: "Returns",
  collections: "COD & collections",
  settlements: "Merchant settlements",
};
export const filterLocation = (path: string, query: Record<string, string>) => {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value && !(key === "page" && value === "1")) parameters.set(key, value);
  return `${path}${parameters.size ? `?${parameters}` : ""}`;
};
type Dialog = {
  title: TranslationKey;
  operation: Operation;
  fields: Field[];
  description?: TranslationKey;
  financial?: boolean;
  messages?: Partial<Record<Failure, TranslationKey>>;
};

export function OperationsDirectory({
  resource,
  query,
}: {
  resource: DirectoryResource;
  query: Record<string, string>;
}) {
  return (
    <OperationsWorkspace>
      {(scope, permissions) => (
        <Directory
          key={JSON.stringify([scope, resource, query])}
          resource={resource}
          query={query}
          scope={scope}
          permissions={permissions}
        />
      )}
    </OperationsWorkspace>
  );
}
function Directory({
  resource,
  query,
  scope,
  permissions,
}: {
  resource: DirectoryResource;
  query: Record<string, string>;
  scope: Scope;
  permissions: Permissions;
}) {
  const { t } = useLocale();
  const companyCurrency = useCompanyCurrency();
  const router = useRouter();
  const searchState = useDebouncedSearch(query.search ?? "");
  const request = { resource, query: { page: "1", pageSize: "25", ...query, search: searchState.search, ...(searchState.search !== (query.search ?? "") ? { page: "1" } : {}) } };
  const { result, retry } = useOperations(scope, request);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [saved, setSaved] = useState(false);
  const [now] = useState(() => Date.now());
  const empty: Record<DirectoryResource, TranslationKey> = {
    merchants: "No merchants yet.",
    parcels: "No parcels yet.",
    returns: "No returns yet.",
    collections: "No collections yet.",
    settlements: "No settlements yet.",
  };
  function complete(data: Data) {
    setDialog(null);
    setSaved(true);
    if (
      data.kind === "saved" &&
      data.id &&
      (resource === "merchants" ||
        resource === "parcels" ||
        resource === "settlements")
    ) {
      router.push(`${resourcePath[resource]}/${data.id}`);
    } else retry();
  }
  const columns: Column[] =
    resource === "merchants"
      ? [
          {
            label: "Business name",
            render: (row) => (
              <Link
                href={`/app/merchants/${row.id}`}
                className="font-semibold text-primary-hover underline-offset-4 hover:underline"
              >
                {valueText(row, "name")}
              </Link>
            ),
          },
          {
            label: "Contact person",
            render: (row) => (
              <>
                <p>{valueText(row, "contactName")}</p>
                <bdi dir="ltr" className="text-xs text-muted-foreground">
                  {valueText(row, "phone")}
                </bdi>
              </>
            ),
          },
          { label: "City / region", render: (row) => valueText(row, "city") },
          {
            label: "Default delivery fee",
            render: (row) => <Money row={row} field="deliveryFee" />,
          },
          {
            label: "Status",
            render: (row) => t(row.active ? "Active merchant" : "Inactive"),
          },
        ]
      : resource === "parcels"
        ? [
            {
              label: "Tracking number",
              render: (row) => (
                <Link
                  href={`/app/parcels/${row.id}`}
                  className="font-semibold text-primary-hover hover:underline"
                >
                  <bdi dir="ltr">{valueText(row, "trackingNumber") || "—"}</bdi>
                </Link>
              ),
            },
            {
              label: "Recipient",
              render: (row) => (
                <>
                  <p>{valueText(row, "recipientName")}</p>
                  <bdi dir="ltr" className="text-xs text-muted-foreground">
                    {valueText(row, "recipientPhone")}
                  </bdi>
                </>
              ),
            },
            { label: "Destination", render: (row) => valueText(row, "city") },
            {
              label: "Status",
              render: (row) => <StatusBadge value={valueText(row, "status")} />,
            },
            {
              label: "Expected customer total",
              render: (row) => (
                <Money row={row} field="expectedCustomerTotal" />
              ),
            },
          ]
        : resource === "returns"
          ? [
              {
                label: "Tracking number",
                render: (row) => (
                  <Link
                    className="text-primary-hover hover:underline"
                    href={`/app/parcels/${valueText(row, "shipmentId")}`}
                  >
                    <bdi dir="ltr">
                      {valueText(row, "trackingNumber") || t("Parcel details")}
                    </bdi>
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
                label: "Return age",
                render: (row) => (
                  <>
                    {Math.max(
                      0,
                      Math.floor(
                        (now - Date.parse(valueText(row, "createdAt"))) /
                          86400000,
                      ),
                    )}{" "}
                    {t("Days")}
                    {valueText(row, "status") !== "RETURNED_TO_MERCHANT" &&
                      now - Date.parse(valueText(row, "createdAt")) >=
                        7 * 86400000 && (
                        <p className="mt-1 text-xs font-semibold text-warning-foreground">
                          {t("Pending for 7+ days")}
                        </p>
                      )}
                  </>
                ),
              },
              {
                label: "Recorded at",
                render: (row) => <DateTime value={row.createdAt} />,
              },
            ]
          : resource === "collections"
            ? [
                {
                  label: "Tracking number",
                  render: (row) => (
                    <DetailLink
                      href={`/app/parcels/${valueText(row, "shipmentId")}`}
                    />
                  ),
                },
                {
                  label: "Collected amount",
                  render: (row) => <Money row={row} field="amount" />,
                },
                {
                  label: "Goods proceeds",
                  render: (row) => <Money row={row} field="goodsAmount" />,
                },
                {
                  label: "Payment method",
                  render: (row) => (
                    <StateLabel value={valueText(row, "method")} />
                  ),
                },
                {
                  label: "Status",
                  render: (row) =>
                    t(row.remittedAt ? "Remitted to company" : "Unremitted"),
                },
                {
                  label: "Recorded at",
                  render: (row) => <DateTime value={row.collectedAt} />,
                },
              ]
            : [
                {
                  label: "Recorded at",
                  render: (row) => <DateTime value={row.createdAt} />,
                },
                {
                  label: "Status",
                  render: (row) => (
                    <StatusBadge value={valueText(row, "status")} />
                  ),
                },
                {
                  label: "Gross collected COD",
                  render: (row) => <Money row={row} field="grossCollected" />,
                },
                {
                  label: "Net payable",
                  render: (row) => <Money row={row} field="netPayable" />,
                },
              ];
  return (
    <>
      <PageIntro
        title={titles[resource]}
        description={
          resource === "returns"
            ? "Return receipt is confirmed separately at each stage."
            : resource === "collections"
              ? "Collection and remittance are separate recorded events."
              : resource === "settlements"
                ? "Approving a settlement doesn't pay it. Record the payment separately."
                : undefined
        }
      >
        <Button variant="outline" onClick={retry}>
          {t("Refresh")}
        </Button>
        {resource === "merchants" && permissions.manageMerchants && (
          <Button
            onClick={() =>
              setDialog({
                title: "Create merchant",
                operation: { resource, action: "create" },
                fields: merchantFields(null, companyCurrency ?? ""),
              })
            }
          >
            {t("Create merchant")}
          </Button>
        )}
        {resource === "parcels" && permissions.manageParcels && (
          <Button
            onClick={() =>
              setDialog({
                title: "Create parcel",
                description:
                  "Price is calculated from the merchant's plan and the destination zone.",
                operation: { resource, action: "create" },
                fields: parcelFields(),
                messages: {
                  conflict:
                    "The price changed. Review the updated quote and save again.",
                },
              })
            }
          >
            {t("Create parcel")}
          </Button>
        )}
        {resource === "collections" && permissions.collect && (
          <Button
            onClick={() =>
              setDialog({
                title: "Record COD collection",
                description:
                  "Record the full amount collected from the customer. Partial amounts aren't supported.",
                financial: true,
                messages: {
                  conflict:
                    "Only delivered parcels that have not been collected yet can be recorded.",
                },
                operation: { resource, action: "create" },
                fields: [
                  {
                    name: "parcelId",
                    label: "Parcels",
                    lookup: "parcels",
                    lookupQuery: { collectable: "true" },
                    required: true,
                    span: true,
                  },
                  ...paymentFields(),
                ],
              })
            }
          >
            {t("Record COD collection")}
          </Button>
        )}
        {resource === "settlements" && permissions.createSettlements && (
          <Button asChild>
            <Link href="/app/settlements/new">{t("Preview settlement")}</Link>
          </Button>
        )}
      </PageIntro>
      {saved && (
        <p
          role="status"
          className="mb-5 rounded-md border border-success-border bg-success-subtle p-3 text-sm"
        >
          {t("Saved successfully.")}
        </p>
      )}
      <DirectoryFilters resource={resource} query={query} scope={scope} searchState={searchState} />
      <ReadState result={result} retry={retry}>
        {(data) =>
          data.kind === "page" ? (
            <>
              <DataTable
                items={data.data.items}
                columns={columns}
                empty={
                  Object.values(query).some(Boolean)
                    ? "No records match these filters."
                    : empty[resource]
                }
                actions={(row) => (
                  <div className="flex flex-wrap justify-end gap-2">
                    {resource === "merchants" ||
                    resource === "parcels" ||
                    resource === "settlements" ? (
                      <DetailLink
                        href={`${resourcePath[resource]}/${row.id}`}
                      />
                    ) : resource === "collections" ? (
                      !row.remittedAt &&
                      permissions.remit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setDialog({
                              title: "Record cash remittance",
                              financial: true,
                              description:
                                "Record the full amount collected from the customer. Partial amounts aren't supported.",
                              operation: {
                                resource,
                                id: row.id,
                                action: "remittance",
                              },
                              fields: paymentFields(valueText(row, "amount")),
                            })
                          }
                        >
                          {t("Record cash remittance")}
                        </Button>
                      )
                    ) : (
                      permissions.advanceReturns &&
                      valueText(row, "status") !== "RETURNED_TO_MERCHANT" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const status =
                              valueText(row, "status") === "RETURN_IN_PROGRESS"
                                ? "RETURNED_TO_WAREHOUSE"
                                : "RETURNED_TO_MERCHANT";
                            setDialog({
                              title:
                                status === "RETURNED_TO_WAREHOUSE"
                                  ? "Confirm warehouse receipt"
                                  : "Confirm merchant handoff",
                              operation: {
                                resource: "returns",
                                id: row.id,
                                action: "transition",
                                input: {
                                  revision: valueNumber(row, "revision"),
                                  status,
                                },
                              },
                              fields: [
                                {
                                  name: "note",
                                  label: "Note",
                                  type: "textarea",
                                },
                              ],
                            });
                          }}
                        >
                          {t(
                            valueText(row, "status") === "RETURN_IN_PROGRESS"
                              ? "Confirm warehouse receipt"
                              : "Confirm merchant handoff",
                          )}
                        </Button>
                      )
                    )}
                  </div>
                )}
              />
              <Pager
                data={data.data}
                onPage={(page) =>
                  router.push(
                    filterLocation(resourcePath[resource], {
                      ...query,
                      page: String(page),
                    }),
                  )
                }
              />
            </>
          ) : null
        }
      </ReadState>
      {resource === "merchants" && permissions.manageMerchants && (
        <p className="mt-5 text-xs">
          <Link
            href="/app/merchants/accounts"
            className="text-primary-hover underline underline-offset-4"
          >
            {t("Merchant accounts")}
          </Link>
        </p>
      )}
      {dialog && (
        <OperationDialog
          {...dialog}
          scope={scope}
          onClose={() => {
            setDialog(null);
            retry();
          }}
          onSaved={complete}
        />
      )}
    </>
  );
}

export function DirectoryFilters({
  resource,
  query,
  scope,
  searchState,
}: {
  resource: Resource;
  query: Record<string, string>;
  scope: Scope;
  searchState?: ReturnType<typeof useDebouncedSearch>;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const localSearch = useDebouncedSearch(query.search ?? "");
  const { text: search, setText: setSearch } = searchState ?? localSearch;
  const path =
    resource in resourcePath
      ? resourcePath[resource as DirectoryResource]
      : "/app/operations";
  return (
    <form
      role="search"
      className="mb-6 min-w-0 rounded-lg border bg-surface"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const next: Record<string, string> = {};
        for (const [key, value] of form.entries())
          if (typeof value === "string" && value.trim())
            next[key] = value.trim();
        router.push(filterLocation(path, { ...next, page: "1" }));
      }}
    >
      <div className="grid min-w-0 gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="operation-search">
            {t(resource === "parcels" ? "Search parcels" : "Search")}
          </Label>
          <Input
            id="operation-search"
            name="search"
            type="search"
            maxLength={100}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              resource === "parcels"
                ? t("Tracking, recipient, phone or order reference")
                : undefined
            }
          />
        </div>
        {(resource === "parcels" ||
          resource === "returns" ||
          resource === "settlements" ||
          resource === "dashboard") && (
          <div className="space-y-2">
            <Label htmlFor="filter-status">{t("Status")}</Label>
            <select
              id="filter-status"
              name="status"
              defaultValue={query.status ?? ""}
              className="min-h-10 w-full rounded-md border border-[var(--control-border)] bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="">{t("All statuses")}</option>
              {(resource === "settlements"
                ? ["DRAFT", "FINALIZED", "PAID", "CANCELLED"]
                : resource === "returns"
                  ? [
                      "RETURN_IN_PROGRESS",
                      "RETURNED_TO_WAREHOUSE",
                      "RETURNED_TO_MERCHANT",
                    ]
                  : [
                      "CREATED",
                      "RECEIVED_FROM_MERCHANT",
                      "AT_WAREHOUSE",
                      "ASSIGNED",
                      "OUT_FOR_DELIVERY",
                      "DELIVERED",
                      "FAILED_DELIVERY",
                      "RETURN_IN_PROGRESS",
                      "RETURNED_TO_WAREHOUSE",
                      "RETURNED_TO_MERCHANT",
                      "CANCELLED",
                    ]
              ).map((status) => (
                <option value={status} key={status}>
                  <StateLabel value={status} />
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <AdvancedFilters collapsible={resource === "parcels"} open={["merchantId", "workerId", "city", "from", "to", "direction"].some(key => Boolean(query[key]))}>
        <div className="grid min-w-0 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {resource !== "merchants" && (
          <EntityPicker
            scope={scope}
            field={{
              name: "merchantId",
              label: "Merchants",
              lookup: "merchants",
              value: query.merchantId,
            }}
          />
        )}
        {(resource === "parcels" ||
          resource === "collections" ||
          resource === "dashboard") && (
          <EntityPicker
            scope={scope}
            field={{
              name: "workerId",
              label: "Drivers",
              lookup: "drivers",
              value: query.workerId,
            }}
          />
        )}
        {(resource === "parcels" || resource === "dashboard") && (
          <EntityCombobox scope={scope} kind="cities" name="city" label="City / region" placeholder="Choose city / region" initialValue={query.city} initialLabel={query.city} />
        )}
        {resource === "returns" && (
          <div className="space-y-2">
            <Label htmlFor="filter-reason">{t("Return reason")}</Label>
            <select
              id="filter-reason"
              name="reason"
              defaultValue={query.reason ?? ""}
              className="min-h-10 w-full rounded-md border border-[var(--control-border)] bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="">{t("All statuses")}</option>
              {returnReasonOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  <StateLabel value={option.value} />
                </option>
              ))}
            </select>
          </div>
        )}
        {resource === "merchants" && (
          <div className="space-y-2">
            <Label htmlFor="filter-active">{t("Status")}</Label>
            <select
              id="filter-active"
              name="active"
              defaultValue={query.active ?? ""}
              className="min-h-10 w-full rounded-md border border-[var(--control-border)] bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="">{t("All merchants")}</option>
              <option value="true">{t("Active merchant")}</option>
              <option value="false">{t("Inactive")}</option>
            </select>
          </div>
        )}
        {resource !== "merchants" &&
          ["from", "to"].map((name) => (
            <div className="space-y-2" key={name}>
              <Label htmlFor={`filter-${name}`}>
                {t(name === "from" ? "From date" : "To date")}
              </Label>
              <LocalizedDateInput
                id={`filter-${name}`}
                name={name}
                defaultValue={query[name]}
              />
            </div>
          ))}
        {resource === "parcels" && (
          <div className="space-y-2">
            <Label htmlFor="filter-direction">{t("Sort by")}</Label>
            <select
              id="filter-direction"
              name="direction"
              defaultValue={query.direction ?? "desc"}
              className="min-h-10 w-full rounded-md border border-[var(--control-border)] bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="desc">{t("Newest first")}</option>
              <option value="asc">{t("Oldest first")}</option>
            </select>
          </div>
        )}
        {resource === "collections" && (
          <div className="space-y-2">
            <Label htmlFor="filter-remitted">{t("Status")}</Label>
            <select
              id="filter-remitted"
              name="remitted"
              defaultValue={query.remitted ?? ""}
              className="min-h-10 w-full rounded-md border border-[var(--control-border)] bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="">{t("All statuses")}</option>
              <option value="false">{t("Unremitted")}</option>
              <option value="true">{t("Remitted to company")}</option>
            </select>
          </div>
        )}
      </div>
      </AdvancedFilters>
      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/50 px-4 py-3 sm:px-5">
        <Button type="submit">{t("Apply filters")}</Button>
        <Button asChild variant="ghost">
          <Link href={path}>{t("Reset filters")}</Link>
        </Button>
      </div>
    </form>
  );
}

function AdvancedFilters({ children, collapsible, open }: { children: ReactNode; collapsible: boolean; open: boolean }) {
  const { t } = useLocale();
  if (!collapsible) return <>{children}</>;
  return <details open={open} className="border-t">
    <summary className="cursor-pointer px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary">{t("Advanced filters")}</summary>
    {children}
  </details>;
}
