"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n";
import { useOperations } from "../use-operations";
import type { Row, Scope } from "../operations-contract";
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
  valueText,
  type Field,
} from "./operations-ui";
import { merchantFields } from "./operation-forms";
import { useProtectedSession, useCompanyCurrency } from "@/features/auth/session/session-context";
import { CompanyMerchantInvitations } from "@/features/merchant-access/company-merchant-invitations";

export function MerchantDetail({ id }: { id: string }) {
  return (
    <OperationsWorkspace>
      {(scope, permissions) => (
        <MerchantContent
          key={`${scope.userId}:${scope.companyId}:${id}`}
          id={id}
          scope={scope}
          permissions={permissions}
        />
      )}
    </OperationsWorkspace>
  );
}
function MerchantContent({
  id,
  scope,
  permissions,
}: {
  id: string;
  scope: Scope;
  permissions: Permissions;
}) {
  const { t } = useLocale();
  const companyCurrency = useCompanyCurrency();
  const profileOnly = useProtectedSession().user.role === "OPERATIONS";
  const { result, retry } = useOperations(scope, { resource: "merchants", id });
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState(0);
  return (
    <ReadState result={result} retry={retry}>
      {(data) =>
        data.kind === "merchant" ? (
          <>
            <PageIntro title="Merchant details">
              <Button asChild variant="outline">
                <Link href="/app/merchants">{t("Back")}</Link>
              </Button>
              {permissions.manageMerchants && (
                <Button onClick={() => setEditing(true)}>
                  {t("Edit merchant")}
                </Button>
              )}
            </PageIntro>
            <div className="space-y-6">
              <Panel title="Business profile">
                <h3 className="mb-5 text-xl font-semibold">
                  {valueText(data.merchant, "name")}
                </h3>
                <DetailsGrid
                  entries={[
                    {
                      label: "Contact person",
                      value: valueText(data.merchant, "contactName"),
                    },
                    {
                      label: "Phone",
                      value: (
                        <bdi dir="ltr">{valueText(data.merchant, "phone")}</bdi>
                      ),
                    },
                    {
                      label: "Secondary phone",
                      value: valueText(data.merchant, "secondaryPhone"),
                    },
                    {
                      label: "Status",
                      value: t(
                        data.merchant.activationStatus === "PENDING"
                          ? "Pending owner acceptance"
                          : data.merchant.active
                            ? "Active merchant"
                            : "Paused merchant",
                      ),
                    },
                    {
                      label: "Pickup address",
                      value: valueText(data.merchant, "pickupAddress"),
                    },
                    {
                      label: "City / region",
                      value: valueText(data.merchant, "city"),
                    },
                    {
                      label: "Internal notes",
                      value: valueText(data.merchant, "notes"),
                    },
                    {
                      label: "Recorded at",
                      value: <DateTime value={data.merchant.createdAt} />,
                    },
                  ]}
                />
              </Panel>
              {/* App access belongs under the merchant profile, not above the page title. */}
              {!profileOnly && <CompanyMerchantInvitations merchantId={id} />}
              {!profileOnly && <Panel title="Commercial terms">
                <DetailsGrid
                  entries={[
                    {
                      label: "Default delivery fee",
                      value: <Money row={data.merchant} field="deliveryFee" />,
                    },
                    {
                      label: "Fee payer",
                      value: t(
                        data.merchant.feePayer === "CUSTOMER"
                          ? "Customer pays"
                          : "Merchant pays",
                      ),
                    },
                    {
                      label: "Return fee",
                      value: <Money row={data.merchant} field="returnFee" />,
                    },
                    {
                      label: "Return fee policy",
                      value: (
                        <StateLabel
                          value={valueText(data.merchant, "returnFeePolicy")}
                        />
                      ),
                    },
                    {
                      label: "Additional service fee",
                      value: <Money row={data.merchant} field="serviceFee" />,
                    },
                    {
                      label: "Settlement notes",
                      value: valueText(data.merchant, "paymentNotes"),
                    },
                  ]}
                />
              </Panel>}
              <Panel title="Merchant parcel history">
                <div className="flex flex-wrap gap-3">
                  <Button asChild variant="outline">
                    <Link href={`/app/parcels?merchantId=${id}`}>
                      {t("Parcels")} · {data.statistics.total?.toLocaleString()}
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link
                      href={`/app/parcels?merchantId=${id}&status=DELIVERED`}
                    >
                      {t("Delivered parcels")} ·{" "}
                      {data.statistics.delivered?.toLocaleString()}
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/app/returns?merchantId=${id}`}>
                      {t("Merchant returns")} ·{" "}
                      {data.statistics.returns?.toLocaleString()}
                    </Link>
                  </Button>
                  {permissions.viewFinance && <Button asChild variant="outline">
                    <Link href={`/app/settlements?merchantId=${id}`}>
                      {t("Merchant settlements")}
                    </Link>
                  </Button>}
                </div>
              </Panel>
              {permissions.viewFinance && (
                <>
                  <Panel title="Balance">
                    <DataTable
                      items={data.balances.map((row) => ({
                        ...row,
                        id: valueText(row, "currency"),
                      }))}
                      columns={[
                        {
                          label: "Currency",
                          render: (row) => valueText(row, "currency"),
                        },
                        {
                          label: "Outstanding balance",
                          render: (row) => <Money row={row} field="balance" />,
                        },
                        {
                          label: "Eligible for settlement",
                          render: (row) => <Money row={row} field="eligible" />,
                        },
                        {
                          label: "Previously paid",
                          render: (row) => <Money row={row} field="paid" />,
                        },
                      ]}
                    />
                  </Panel>
                  <MerchantStatement
                    key={revision}
                    id={id}
                    scope={scope}
                    editable={permissions.approveSettlements}
                    onChanged={retry}
                  />
                </>
              )}
            </div>
            {editing && (
              <OperationDialog
                title="Edit merchant"
                scope={scope}
                operation={{
                  resource: "merchants",
                  id,
                  action: "edit",
                  input: { revision: data.merchant.revision },
                }}
                fields={merchantFields(data.merchant, companyCurrency ?? "")}
                onClose={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  retry();
                  setRevision((value) => value + 1);
                }}
              />
            )}
          </>
        ) : null
      }
    </ReadState>
  );
}
function MerchantStatement({
  id,
  scope,
  editable,
  onChanged,
}: {
  id: string;
  scope: Scope;
  editable: boolean;
  onChanged: () => void;
}) {
  const { t, tMessage } = useLocale();
  const [page, setPage] = useState(1);
  // OD-02: a company has one currency, so the statement is always in it.
  const currency = useCompanyCurrency() ?? "";
  const [dialog, setDialog] = useState<{ row?: Row } | null>(null);
  const { result, retry } = useOperations(scope, {
    resource: "statement",
    id,
    query: { page: String(page), pageSize: "25", ...(currency ? { currency } : {}) },
  });
  const fields: Field[] = dialog?.row
    ? [
        {
          name: "reason",
          label: "Reason",
          required: true,
          type: "textarea",
          span: true,
        },
      ]
    : [
        {
          name: "currency",
          label: "Currency",
          required: true,
          value: currency,
          options: [{ value: currency, label: currency, literal: true }],
        },
        {
          name: "amount",
          label: "Adjustment amount",
          required: true,
          type: "money",
          signed: true,
        },
        {
          name: "reason",
          label: "Reason",
          required: true,
          type: "textarea",
          span: true,
        },
      ];
  return (
    <Panel
      title="Statement"
      action={
        editable && (
          <Button variant="outline" onClick={() => setDialog({})}>
            {t("Record adjustment")}
          </Button>
        )
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        {t(
          "Financial entries are permanent. Corrections use a recorded reversal.",
        )}
      </p>
      <ReadState result={result} retry={retry}>
        {(data) =>
          data.kind === "page" ? (
            <>
              <DataTable
                items={data.data.items}
                columns={[
                  {
                    label: "Recorded at",
                    render: (row) => <DateTime value={row.createdAt} />,
                  },
                  {
                    label: "Entry",
                    render: (row) => (
                      <StateLabel value={valueText(row, "kind")} />
                    ),
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
                actions={(row) =>
                  editable &&
                  row.kind === "ADJUSTMENT" &&
                  !row.allocationSettlementId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDialog({ row })}
                    >
                      {t("Reverse adjustment")}
                    </Button>
                  )
                }
              />
              <Pager data={data.data} onPage={setPage} />
            </>
          ) : null
        }
      </ReadState>
      {dialog && (
        <OperationDialog
          title={dialog.row ? "Reverse adjustment" : "Record adjustment"}
          scope={scope}
          financial
          operation={{
            resource: "adjustments",
            action: dialog.row ? "reversal" : "create",
            id: dialog.row?.id,
            input: { merchantId: id },
          }}
          fields={fields}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            onChanged();
          }}
        />
      )}
    </Panel>
  );
}
