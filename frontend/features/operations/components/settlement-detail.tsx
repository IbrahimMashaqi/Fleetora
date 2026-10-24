"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { useOperations } from "../use-operations";
import type { Data, Operation, Row, Scope } from "../operations-contract";
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
  Panel,
  ReadState,
  StateLabel,
  StatusBadge,
  valueNumber,
  valueText,
  type Field,
} from "./operations-ui";
import { paymentFields } from "./operation-forms";

export function SettlementTotals({ row }: { row: Row }) {
  return (
    <DetailsGrid
      entries={[
        {
          label: "Gross collected COD",
          value: <Money row={row} field="grossCollected" />,
        },
        {
          label: "Delivery fees",
          value: <Money row={row} field="deliveryFees" />,
        },
        { label: "Return fees", value: <Money row={row} field="returnFees" /> },
        {
          label: "Adjustments",
          value: <Money row={row} field="adjustments" />,
        },
        {
          label: "Net payable",
          value: (
            <strong>
              <Money row={row} field="netPayable" />
            </strong>
          ),
        },
      ]}
    />
  );
}
function SettlementLines({
  lines,
  currency,
}: {
  lines: Row[];
  currency: string;
}) {
  const { tMessage } = useLocale();
  return (
    <DataTable
      items={lines}
      columns={[
        {
          label: "Parcels",
          render: (row) =>
            row.shipmentId ? (
              <Link
                className="break-all text-xs text-primary-hover underline"
                href={`/app/parcels/${valueText(row, "shipmentId")}`}
              >
                <bdi dir="ltr">{valueText(row, "shipmentId")}</bdi>
              </Link>
            ) : (
              <StateLabel value={valueText(row, "kind")} />
            ),
        },
        {
          label: "Entry",
          render: (row) => <StateLabel value={valueText(row, "kind")} />,
        },
        {
          label: "Reason",
          render: (row) =>
            ["DELIVERY_FEE", "RETURN_FEE"].includes(
              valueText(row, "reason"),
            ) ? (
              <StateLabel value={valueText(row, "reason")} />
            ) : (
              tMessage(valueText(row, "reason"))
            ),
        },
        {
          label: "Amount",
          render: (row) => (
            <Money row={row} field="amount" currency={currency} />
          ),
        },
      ]}
    />
  );
}
export function SettlementPreview({ merchantId }: { merchantId?: string }) {
  return (
    <OperationsWorkspace>
      {(scope, permissions) =>
        permissions.createSettlements ? (
          <PreviewContent
            key={`${scope.userId}:${scope.companyId}`}
            scope={scope}
            merchantId={merchantId}
          />
        ) : null
      }
    </OperationsWorkspace>
  );
}
function PreviewContent({
  scope,
  merchantId,
}: {
  scope: Scope;
  merchantId?: string;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<{
    data: Extract<Data, { kind: "preview" }>;
    input: Record<string, unknown>;
  } | null>(null);
  return (
    <>
      <PageIntro
        title="Preview settlement"
        description="Draft lines reserve eligible funds until approval or cancellation."
      >
        <Button asChild variant="outline">
          <Link href="/app/settlements">{t("Back")}</Link>
        </Button>
        {preview && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            {t("Preview settlement")}
          </Button>
        )}
      </PageIntro>
      {preview && (
        <div className="space-y-6">
          <Panel title="Preview settlement">
            <SettlementTotals row={preview.data.preview} />
          </Panel>
          <Panel title="Settlement lines">
            <SettlementLines
              lines={preview.data.lines}
              currency={valueText(preview.data.preview, "currency")}
            />
          </Panel>
          <Button
            disabled={!preview.data.lines.length}
            onClick={() => setConfirming(true)}
          >
            {t("Create settlement draft")}
          </Button>
        </div>
      )}
      {editing && (
        <OperationDialog
          title="Preview settlement"
          scope={scope}
          confirmLabel="Preview settlement"
          operation={{ resource: "settlements", action: "preview" }}
          fields={[
            {
              name: "merchantId",
              label: "Merchants",
              lookup: "merchants",
              required: true,
              value: merchantId,
              span: true,
            },
            {
              name: "currency",
              label: "Currency",
              required: true,
              value: "ILS",
              options: ["ILS", "USD", "EUR", "JOD"].map((value) => ({
                value,
                label: value,
                literal: true,
              })),
            },
            { name: "from", label: "From date", type: "date" },
            { name: "to", label: "To date", type: "date" },
          ]}
          onClose={() => setEditing(false)}
          onSaved={(data, input) => {
            if (data.kind === "preview") {
              setPreview({ data, input });
              setEditing(false);
            }
          }}
        />
      )}
      {confirming && preview && (
        <OperationDialog
          title="Create settlement draft"
          scope={scope}
          financial
          operation={{
            resource: "settlements",
            action: "create",
            input: {
              ...preview.input,
              expectedPreviewHash: valueText(
                preview.data.preview,
                "previewHash",
              ),
            },
          }}
          description="Draft lines reserve eligible funds until approval or cancellation."
          onClose={() => setConfirming(false)}
          onSaved={(data) => {
            if (data.kind === "saved" && data.id)
              router.push(`/app/settlements/${data.id}`);
          }}
        >
          <div className="mt-5">
            <SettlementTotals row={preview.data.preview} />
          </div>
        </OperationDialog>
      )}
    </>
  );
}
export function SettlementDetail({ id }: { id: string }) {
  return (
    <OperationsWorkspace>
      {(scope, permissions) => (
        <DetailContent
          key={`${scope.userId}:${scope.companyId}:${id}`}
          scope={scope}
          permissions={permissions}
          id={id}
        />
      )}
    </OperationsWorkspace>
  );
}
function DetailContent({
  id,
  scope,
  permissions,
}: {
  id: string;
  scope: Scope;
  permissions: Permissions;
}) {
  const { t } = useLocale();
  const { result, retry } = useOperations(scope, {
    resource: "settlements",
    id,
  });
  const [dialog, setDialog] = useState<{
    title: TranslationKey;
    action: Operation["action"];
    fields: Field[];
    description?: TranslationKey;
  } | null>(null);
  return (
    <ReadState result={result} retry={retry}>
      {(data) =>
        data.kind === "settlement" ? (
          <>
            <PageIntro title="Settlement details">
              <Button asChild variant="outline">
                <Link href="/app/settlements">{t("Back")}</Link>
              </Button>
              <Button variant="outline" onClick={retry}>
                {t("Refresh")}
              </Button>
            </PageIntro>
            <div className="space-y-6">
              <Panel
                title="Merchant settlements"
                action={
                  <StatusBadge value={valueText(data.settlement, "status")} />
                }
              >
                <SettlementTotals row={data.settlement} />
                <p className="mt-4 text-xs text-muted-foreground">
                  <DateTime value={data.settlement.createdAt} />
                </p>
                <Button asChild variant="ghost" className="mt-3">
                  <Link
                    href={`/app/merchants/${valueText(data.settlement, "merchantId")}`}
                  >
                    {t("Merchant details")}
                  </Link>
                </Button>
              </Panel>
              <Panel title="Settlement lines">
                <SettlementLines
                  lines={data.lines}
                  currency={valueText(data.settlement, "currency")}
                />
              </Panel>
              <Panel title="Payments">
                <DataTable
                  items={data.payments}
                  columns={[
                    {
                      label: "Actual payment date",
                      render: (row) => <DateTime value={row.paidAt} />,
                    },
                    {
                      label: "Amount",
                      render: (row) => (
                        <Money
                          row={row}
                          field="amount"
                          currency={valueText(data.settlement, "currency")}
                        />
                      ),
                    },
                    {
                      label: "Payment method",
                      render: (row) => (
                        <StateLabel value={valueText(row, "method")} />
                      ),
                    },
                    {
                      label: "Payment reference",
                      render: (row) => valueText(row, "reference"),
                    },
                  ]}
                />
              </Panel>
              <div className="flex flex-wrap gap-3">
                {data.settlement.status === "DRAFT" && (
                  <>
                    {permissions.approveSettlements && (
                      <Button
                        onClick={() =>
                          setDialog({
                            title: "Approve settlement",
                            action: "finalize",
                            description:
                              "Approving a settlement does not record a payment.",
                            fields: [],
                          })
                        }
                      >
                        {t("Approve settlement")}
                      </Button>
                    )}
                    {permissions.createSettlements && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          setDialog({
                            title: "Cancel draft",
                            action: "cancel",
                            fields: [
                              {
                                name: "reason",
                                label: "Reason",
                                type: "textarea",
                                required: true,
                                span: true,
                              },
                            ],
                          })
                        }
                      >
                        {t("Cancel draft")}
                      </Button>
                    )}
                  </>
                )}
                {data.settlement.status === "FINALIZED" &&
                  permissions.paySettlements && (
                    <Button
                      onClick={() =>
                        setDialog({
                          title: "Record merchant payout",
                          action: "payment",
                          description:
                            "Confirm the actual payment before recording it.",
                          fields: paymentFields(
                            valueText(data.settlement, "netPayable"),
                            true,
                          ),
                        })
                      }
                    >
                      {t("Record merchant payout")}
                    </Button>
                  )}
              </div>
            </div>
            {dialog && (
              <OperationDialog
                title={dialog.title}
                description={dialog.description}
                fields={dialog.fields}
                financial
                scope={scope}
                operation={{
                  resource: "settlements",
                  id,
                  action: dialog.action,
                  input: { revision: valueNumber(data.settlement, "revision") },
                }}
                onClose={() => {
                  setDialog(null);
                  retry();
                }}
                onSaved={() => {
                  setDialog(null);
                  retry();
                }}
              >
                <div className="mt-5">
                  <SettlementTotals row={data.settlement} />
                </div>
              </OperationDialog>
            )}
          </>
        ) : null
      }
    </ReadState>
  );
}
