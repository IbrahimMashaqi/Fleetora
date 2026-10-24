"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { useOperations } from "../use-operations";
import type { Operation, Scope } from "../operations-contract";
import {
  OperationsWorkspace,
  PageIntro,
  type Permissions,
} from "./operations-workspace";
import {
  DataTable,
  DateTime,
  DetailsGrid,
  Money,
  OperationDialog,
  Pager,
  Panel,
  ReadState,
  StateLabel,
  StatusBadge,
  valueNumber,
  valueText,
  type Field,
} from "./operations-ui";
import {
  parcelFields,
  paymentFields,
  returnReasonOptions,
} from "./operation-forms";

const eventLabels: Record<string, TranslationKey> = {
  PARCEL_CREATED: "Create parcel",
  PARCEL_EDITED: "Edit parcel",
  STATUS_CHANGED: "Change status",
  DRIVER_ASSIGNED: "Assign parcel",
  CUSTODY_RECORDED: "Record custody / location",
  COD_COLLECTED: "Record COD collection",
  CASH_REMITTED: "Record cash remittance",
  RETURN_INITIATED: "Initiate return",
  DELIVERY_ATTEMPT: "Record attempt",
  RETURNED_TO_WAREHOUSE: "Confirm warehouse receipt",
  RETURNED_TO_MERCHANT: "Confirm merchant handoff",
  FINANCIAL_ADJUSTMENT: "Record adjustment",
};
type Dialog = {
  title: TranslationKey;
  operation: Operation;
  fields: Field[];
  financial?: boolean;
  description?: TranslationKey;
};
export function ParcelDetail({ id }: { id: string }) {
  return (
    <OperationsWorkspace>
      {(scope, permissions) => (
        <ParcelContent
          key={`${scope.userId}:${scope.companyId}:${id}`}
          id={id}
          scope={scope}
          permissions={permissions}
        />
      )}
    </OperationsWorkspace>
  );
}
function ParcelContent({
  id,
  scope,
  permissions,
}: {
  id: string;
  scope: Scope;
  permissions: Permissions;
}) {
  const { t, tMessage } = useLocale();
  const { result, retry } = useOperations(scope, { resource: "parcels", id });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [saved, setSaved] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  return (
    <ReadState result={result} retry={retry}>
      {(data) => {
        if (data.kind !== "parcel") return null;
        const parcel = data.parcel,
          revision = valueNumber(parcel, "revision"),
          status = valueText(parcel, "status");
        const operate = (
          title: TranslationKey,
          action: Operation["action"],
          fields: Field[],
          input?: Record<string, unknown>,
        ) =>
          setDialog({
            title,
            operation: {
              resource: "parcels",
              id,
              action,
              input: { revision, ...input },
            },
            fields,
          });
        const transitions = data.allowedTransitions.filter(
          (state) =>
            ![
              "ASSIGNED",
              "RETURN_IN_PROGRESS",
              "RETURNED_TO_WAREHOUSE",
              "RETURNED_TO_MERCHANT",
            ].includes(state),
        );
        return (
          <>
            <PageIntro title="Parcel details">
              <Button asChild variant="outline">
                <Link href="/app/parcels">{t("Back")}</Link>
              </Button>
              <Button variant="outline" onClick={retry}>
                {t("Refresh")}
              </Button>
              {permissions.manageParcels && status === "CREATED" && parcel.pricingMode !== "FINAL_INCLUSIVE" && (
                <Button
                  onClick={() =>
                    operate(
                      "Edit parcel",
                      "edit",
                      parcelFields(
                        parcel,
                        data.merchant
                          ? valueText(data.merchant, "name")
                          : undefined,
                      ),
                    )
                  }
                >
                  {t("Edit parcel")}
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
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-surface p-5">
              <bdi dir="ltr" className="text-lg font-semibold">
                {valueText(parcel, "trackingNumber") || "—"}
              </bdi>
              <StatusBadge value={status} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Recipient">
                <DetailsGrid
                  entries={[
                    {
                      label: "Business name",
                      value: data.merchant && (
                        <Link
                          className="text-primary-hover underline"
                          href={`/app/merchants/${data.merchant.id}`}
                        >
                          {valueText(data.merchant, "name")}
                        </Link>
                      ),
                    },
                    {
                      label: "Recipient name",
                      value: valueText(parcel, "recipientName"),
                    },
                    {
                      label: "Recipient phone",
                      value: (
                        <bdi dir="ltr">
                          {valueText(parcel, "recipientPhone")}
                        </bdi>
                      ),
                    },
                    {
                      label: "Secondary phone",
                      value: valueText(parcel, "secondaryPhone"),
                    },
                    {
                      label: "Delivery address",
                      value: valueText(parcel, "destination"),
                    },
                    {
                      label: "City / region",
                      value: valueText(parcel, "city"),
                    },
                    {
                      label: "Customer notes",
                      value: valueText(parcel, "customerNotes"),
                    },
                    {
                      label: "Delivery instructions",
                      value: valueText(parcel, "instructions"),
                    },
                    {
                      label: "Merchant reference",
                      value: valueText(parcel, "merchantReference"),
                    },
                  ]}
                />
              </Panel>
              <Panel title="Last known operational location">
                <DetailsGrid
                  entries={[
                    {
                      label: "Last known operational location",
                      value:
                        tMessage(valueText(parcel, "locationLabel")) ||
                        t("Location not available"),
                    },
                    {
                      label: "Custody",
                      value: (
                        <StateLabel value={valueText(parcel, "custody")} />
                      ),
                    },
                    {
                      label: "Location source",
                      value: (
                        <StateLabel
                          value={valueText(parcel, "locationSource")}
                        />
                      ),
                    },
                    {
                      label: "Recorded at",
                      value: <DateTime value={parcel.locationUpdatedAt} />,
                    },
                    {
                      label: "Drivers",
                      value:
                        (data.worker
                          ? valueText(data.worker, "fullName")
                          : "") ||
                        (parcel.workerId
                          ? t("Assigned to driver")
                          : t("Not recorded")),
                    },
                    {
                      label: "Responsible staff",
                      value: (
                        <bdi dir="ltr">
                          {valueText(parcel, "responsibleActorId")}
                        </bdi>
                      ),
                    },
                  ]}
                />
                <p className="mt-5 text-xs leading-6 text-muted-foreground">
                  {t("Operational location is a staff record, not live GPS.")}
                </p>
              </Panel>
              <Panel title="Parcel description">
                <DetailsGrid
                  entries={[
                    {
                      label: "Parcel description",
                      value: valueText(parcel, "description"),
                    },
                    { label: "Pieces", value: parcel.pieces },
                    { label: "Weight (kg)", value: parcel.weight },
                    {
                      label: "Priority",
                      value: (
                        <StateLabel value={valueText(parcel, "priority")} />
                      ),
                    },
                    {
                      label: "Scheduled delivery",
                      value: <DateTime value={parcel.scheduledAt} />,
                    },
                    {
                      label: "Internal notes",
                      value: valueText(parcel, "notes"),
                    },
                  ]}
                />
              </Panel>
              <Panel title="COD & collections">
                <DetailsGrid
                  entries={[
                    {
                      label: parcel.pricingMode === "FINAL_INCLUSIVE" ? "Final customer payable" : "COD goods amount",
                      value: <Money row={parcel} field="codAmount" />,
                    },
                    {
                      label: "Expected customer total",
                      value: (
                        <Money row={parcel} field="expectedCustomerTotal" />
                      ),
                    },
                    {
                      label: "Delivery fees",
                      value: <Money row={parcel} field="deliveryFee" />,
                    },
                    {
                      label: "Additional service fee",
                      value: <Money row={parcel} field="serviceFee" />,
                    },
                    {
                      label: "Fee payer",
                      value: t(
                        parcel.feePayer === "CUSTOMER"
                          ? "Customer pays"
                          : "Merchant pays",
                      ),
                    },
                    {
                      label: "Status",
                      value: t(
                        data.collection
                          ? "Collection recorded"
                          : "Not collected",
                      ),
                    },
                    {
                      label: "Collected amount",
                      value: data.collection ? (
                        <Money row={data.collection} field="amount" />
                      ) : (
                        "—"
                      ),
                    },
                    {
                      label: "Record cash remittance",
                      value: t(
                        data.collection?.remittedAt
                          ? "Remitted to company"
                          : "Unremitted",
                      ),
                    },
                  ]}
                />
                <p className="mt-4 text-xs leading-6 text-muted-foreground">
                  {t("Collection and remittance are separate recorded events.")}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {permissions.collect &&
                    status === "DELIVERED" &&
                    parcel.collectionRequired !== false &&
                    !data.collection && (
                      <Button
                        onClick={() =>
                          setDialog({
                            title: "Record COD collection",
                            financial: true,
                            description:
                              "Full amounts only; partial collections, remittances and payouts are not supported.",
                            operation: {
                              resource: "collections",
                              action: "create",
                              input: { parcelId: id },
                            },
                            fields: paymentFields(
                              valueText(parcel, "expectedCustomerTotal"),
                            ),
                          })
                        }
                      >
                        {t("Record COD collection")}
                      </Button>
                    )}
                  {permissions.remit &&
                    data.collection &&
                    !data.collection.remittedAt && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          setDialog({
                            title: "Record cash remittance",
                            financial: true,
                            operation: {
                              resource: "collections",
                              id: data.collection!.id,
                              action: "remittance",
                            },
                            fields: paymentFields(
                              valueText(data.collection!, "amount"),
                            ),
                          })
                        }
                      >
                        {t("Record cash remittance")}
                      </Button>
                    )}
                </div>
              </Panel>
            </div>
            {permissions.manageParcels &&
              status === "FAILED_DELIVERY" &&
              parcel.custody === "DRIVER" && (
                <p className="my-4 text-sm text-muted-foreground">
                  {t(
                    "Record warehouse handback before assigning a different driver.",
                  )}
                </p>
              )}
            {permissions.manageParcels && (
              <div className="my-6 flex flex-wrap gap-3 rounded-lg border bg-surface p-5">
                {transitions.length > 0 && (
                  <Button
                    onClick={() =>
                      operate("Change status", "transition", [
                        {
                          name: "status",
                          label: "Next status",
                          required: true,
                          options: transitions.map((value) => ({
                            value,
                            label: statusTranslation(value),
                          })),
                        },
                        {
                          name: "note",
                          label: "Note",
                          type: "textarea",
                          required: false,
                          span: true,
                        },
                      ])
                    }
                  >
                    {t("Change status")}
                  </Button>
                )}
                {["AT_WAREHOUSE", "ASSIGNED", "FAILED_DELIVERY"].includes(
                  status,
                ) &&
                  parcel.custody !== "DRIVER" && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        operate("Assign parcel", "assignment", [
                          {
                            name: "workerId",
                            label: "Drivers",
                            lookup: "drivers",
                            required: true,
                            value: parcel.workerId,
                            lookupLabel: valueText(parcel, "workerName"),
                            span: true,
                          },
                          {
                            name: "note",
                            label: "Note",
                            type: "textarea",
                            span: true,
                          },
                        ])
                      }
                    >
                      {t("Assign parcel")}
                    </Button>
                  )}
                {["OUT_FOR_DELIVERY"].includes(status) && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      operate("Record attempt", "attempts", [
                        {
                          name: "outcome",
                          label: "Attempt outcome",
                          required: true,
                          options: [
                            {
                              value: "DELIVERED",
                              label: "Successful delivery",
                            },
                            { value: "FAILED", label: "Failed attempt" },
                          ],
                        },
                        { name: "reason", label: "Reason" },
                        {
                          name: "note",
                          label: "Note",
                          type: "textarea",
                          span: true,
                        },
                      ])
                    }
                  >
                    {t("Record attempt")}
                  </Button>
                )}
                {!["DELIVERED", "CANCELLED", "RETURNED_TO_MERCHANT"].includes(
                  status,
                ) && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      operate("Record custody / location", "location", [
                        {
                          name: "custody",
                          label: "Custody",
                          required: true,
                          value:
                            parcel.custody === "MERCHANT"
                              ? "COMPANY"
                              : parcel.custody,
                          options: [
                            { value: "COMPANY", label: "Company custody" },
                            { value: "WAREHOUSE", label: "Warehouse custody" },
                            { value: "DRIVER", label: "Driver custody" },
                          ],
                        },
                        {
                          name: "locationSource",
                          label: "Location source",
                          required: true,
                          value: "MANUAL_HANDOFF",
                          options: [
                            {
                              value: "MANUAL_HANDOFF",
                              label: "Manual handoff",
                            },
                            { value: "WAREHOUSE", label: "Warehouse" },
                            {
                              value: "HEADQUARTERS",
                              label: "Company headquarters",
                            },
                          ],
                        },
                        {
                          name: "locationLabel",
                          label: "Location description",
                          required: true,
                          span: true,
                        },
                        {
                          name: "note",
                          label: "Note",
                          type: "textarea",
                          span: true,
                        },
                      ])
                    }
                  >
                    {t("Record custody / location")}
                  </Button>
                )}
                {permissions.manageReturns &&
                  data.allowedTransitions.includes("RETURN_IN_PROGRESS") && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        setDialog({
                          title: "Initiate return",
                          description: "Explanation required for Other.",
                          operation: {
                            resource: "returns",
                            action: "create",
                            input: { parcelId: id, revision },
                          },
                          fields: [
                            {
                              name: "reason",
                              label: "Return reason",
                              required: true,
                              options: returnReasonOptions,
                            },
                            {
                              name: "note",
                              label: "Note",
                              type: "textarea",
                              span: true,
                            },
                          ],
                        })
                      }
                    >
                      {t("Initiate return")}
                    </Button>
                  )}
              </div>
            )}
            {data.returnRecord && (
              <div className="my-6">
                <Panel title="Returns">
                  <DetailsGrid
                    entries={[
                      {
                        label: "Return reason",
                        value: (
                          <StateLabel
                            value={valueText(data.returnRecord, "reason")}
                          />
                        ),
                      },
                      {
                        label: "Status",
                        value: (
                          <StatusBadge
                            value={valueText(data.returnRecord, "status")}
                          />
                        ),
                      },
                      {
                        label: "Note",
                        value: valueText(data.returnRecord, "note"),
                      },
                      {
                        label: "Return fee",
                        value: (
                          <Money
                            row={
                              parcel.returnFeePolicy === "NONE"
                                ? { ...parcel, returnFee: "0" }
                                : parcel
                            }
                            field="returnFee"
                          />
                        ),
                      },
                      {
                        label: "Return fee policy",
                        value: (
                          <StateLabel
                            value={valueText(parcel, "returnFeePolicy")}
                          />
                        ),
                      },
                    ]}
                  />
                  {permissions.manageReturns &&
                    data.returnRecord.status !== "RETURNED_TO_MERCHANT" && (
                      <Button
                        className="mt-4"
                        variant="outline"
                        onClick={() => {
                          const next =
                            data.returnRecord!.status === "RETURN_IN_PROGRESS"
                              ? "RETURNED_TO_WAREHOUSE"
                              : "RETURNED_TO_MERCHANT";
                          setDialog({
                            title:
                              next === "RETURNED_TO_WAREHOUSE"
                                ? "Confirm warehouse receipt"
                                : "Confirm merchant handoff",
                            operation: {
                              resource: "returns",
                              id: data.returnRecord!.id,
                              action: "transition",
                              input: { revision, status: next },
                            },
                            fields: [
                              {
                                name: "note",
                                label: "Note",
                                type: "textarea",
                                span: true,
                              },
                            ],
                          });
                        }}
                      >
                        {t(
                          data.returnRecord.status === "RETURN_IN_PROGRESS"
                            ? "Confirm warehouse receipt"
                            : "Confirm merchant handoff",
                        )}
                      </Button>
                    )}
                </Panel>
              </div>
            )}
            <div className="mt-6 space-y-6">
              <ParcelTimeline key={historyVersion} id={id} scope={scope} />
              <Panel title="Delivery attempts">
                <DataTable
                  items={data.attempts}
                  columns={[
                    {
                      label: "Recorded at",
                      render: (row) => <DateTime value={row.createdAt} />,
                    },
                    {
                      label: "Attempt outcome",
                      render: (row) =>
                        t(
                          row.outcome === "DELIVERED"
                            ? "Successful delivery"
                            : "Failed attempt",
                        ),
                    },
                    {
                      label: "Reason",
                      render: (row) => valueText(row, "reason"),
                    },
                    { label: "Note", render: (row) => valueText(row, "note") },
                  ]}
                />
              </Panel>
            </div>
            {dialog && (
              <OperationDialog
                {...dialog}
                scope={scope}
                onClose={() => {
                  setDialog(null);
                  retry();
                }}
                onSaved={() => {
                  setDialog(null);
                  setSaved(true);
                  retry();
                  setHistoryVersion((value) => value + 1);
                }}
              />
            )}
          </>
        );
      }}
    </ReadState>
  );
}
function statusTranslation(value: string): TranslationKey {
  const map: Record<string, TranslationKey> = {
    RECEIVED_FROM_MERCHANT: "Received from merchant",
    AT_WAREHOUSE: "At warehouse",
    OUT_FOR_DELIVERY: "Out for delivery",
    DELIVERED: "Delivered",
    FAILED_DELIVERY: "Delivery failed",
    CANCELLED: "Cancelled",
  };
  return map[value] ?? "Not recorded";
}
function ParcelTimeline({ id, scope }: { id: string; scope: Scope }) {
  const { t, tMessage } = useLocale();
  const [page, setPage] = useState(1);
  const history = useOperations(scope, {
    resource: "events",
    id,
    query: { page: String(page), pageSize: "25" },
  });
  return (
    <Panel title="Activity timeline">
      <ReadState result={history.result} retry={history.retry}>
        {(data) =>
          data.kind === "page" ? (
            <>
              {data.data.items.length ? (
                <ol className="space-y-6 border-s-2 border-border ps-5">
                  {data.data.items.map((row) => (
                    <li key={row.id} className="relative">
                      <span className="absolute top-1 -start-[26px] size-2.5 rounded-full bg-primary" />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {t(
                            eventLabels[valueText(row, "event")] ??
                              "Recent activity",
                          )}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          <DateTime value={row.occurredAt} />
                        </span>
                      </div>
                      {row.toStatus && (
                        <div className="mt-2">
                          <StatusBadge value={valueText(row, "toStatus")} />
                        </div>
                      )}
                      {row.oldWorkerName && (
                        <p className="mt-2 text-xs">
                          {t("Previous driver")}:{" "}
                          {valueText(row, "oldWorkerName")}
                        </p>
                      )}
                      {row.newWorkerName && (
                        <p className="mt-1 text-xs">
                          {t("New driver")}: {valueText(row, "newWorkerName")}
                        </p>
                      )}
                      {row.note && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                          {valueText(row, "note")}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t("Custody")}:{" "}
                        <StateLabel value={valueText(row, "custody")} />
                        {row.locationLabel && (
                          <> · {tMessage(valueText(row, "locationLabel"))}</>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("Responsible staff")}:{" "}
                        <bdi dir="ltr">{valueText(row, "actorId") || "—"}</bdi>
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("No activity recorded.")}
                </p>
              )}
              <Pager data={data.data} onPage={setPage} />
            </>
          ) : null
        }
      </ReadState>
    </Panel>
  );
}
