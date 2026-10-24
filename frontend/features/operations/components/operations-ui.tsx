"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { withSessionLock } from "@/lib/auth/session-lock";
import { operationsAction } from "../operations.action";
import { useOperations } from "../use-operations";
import { displayMoney } from "../money";
import type {
  Data,
  Failure,
  Operation,
  Page,
  Result,
  Row,
  Scope,
} from "../operations-contract";

export const valueText = (row: Row, field: string) =>
  typeof row[field] === "string" ? row[field] : "";
export const valueNumber = (row: Row, field: string) =>
  typeof row[field] === "number" ? row[field] : 0;
const states: Record<string, TranslationKey> = {
  NONE: "No return charge",
  ON_MERCHANT_HANDOFF: "Charge on merchant handoff",
  MERCHANT_ADDRESS: "Merchant address",
  OPERATIONAL_EVENT: "Operational record",
  VERIFIED_DELIVERY: "Verified delivery",
  VERIFIED_RETURN_HANDOFF: "Verified return handoff",
  READY_FOR_DISPATCH: "Ready for dispatch",
  PICKED_UP: "Picked up",
  RESCHEDULED: "Rescheduled",
  ON_HOLD: "On hold",
  RETURNED: "Returned",
  CREATED: "Created",
  RECEIVED_FROM_MERCHANT: "Received from merchant",
  AT_WAREHOUSE: "At warehouse",
  ASSIGNED: "Assigned to driver",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  FAILED_DELIVERY: "Delivery failed",
  RETURN_IN_PROGRESS: "Return in progress",
  RETURNED_TO_WAREHOUSE: "Returned to warehouse",
  RETURNED_TO_MERCHANT: "Returned to merchant",
  CANCELLED: "Cancelled",
  DRAFT: "Draft",
  FINALIZED: "Finalized",
  PAID: "Paid",
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
  MERCHANT: "Merchant custody",
  COMPANY: "Company custody",
  WAREHOUSE: "Warehouse custody",
  DRIVER: "Driver custody",
  CUSTOMER: "Customer custody",
  MANUAL_HANDOFF: "Manual handoff",
  HEADQUARTERS: "Company headquarters",
  CUSTOMER_REFUSED: "Customer refused",
  UNREACHABLE: "Customer unreachable",
  WRONG_ADDRESS: "Incorrect address",
  CUSTOMER_CANCELLED: "Customer cancellation",
  DAMAGED: "Damaged parcel",
  ATTEMPTS_EXHAUSTED: "Attempts exhausted",
  MERCHANT_REQUESTED: "Merchant requested return",
  OTHER: "Other reason",
  GOODS: "Goods",
  DELIVERY_FEE: "Delivery fees",
  RETURN_FEE: "Return fees",
  ADJUSTMENT: "Adjustment",
  REVERSAL: "Reversal",
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
};
export function StateLabel({ value }: { value: string }) {
  const { t } = useLocale();
  return <>{states[value] ? t(states[value]) : t("Not recorded")}</>;
}
export function StatusBadge({ value }: { value: string }) {
  const colors =
    value === "DELIVERED" || value === "PAID"
      ? "bg-success-subtle text-foreground"
      : /FAILED|CANCELLED/.test(value)
        ? "bg-danger-subtle text-foreground"
        : /RETURN|DRAFT/.test(value)
          ? "bg-warning-subtle text-foreground"
          : "bg-secondary text-foreground";
  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${colors}`}
    >
      <StateLabel value={value} />
    </span>
  );
}
const errors: Record<Failure, TranslationKey> = {
  invalid:
    "Check required fields, amounts, currency and the current record state.",
  forbidden: "Your account cannot perform this operation.",
  changed: "Your company session changed. Reload before continuing.",
  "not-found": "This record was not found in your company.",
  conflict:
    "The record changed or this action was already recorded. Refresh to verify.",
  unavailable: "Operations are temporarily unavailable. Try again.",
  uncertain:
    "The result is uncertain. Close this dialog and refresh the record before trying again.",
  unauthenticated: "Please sign in again.",
};
export function ErrorState({
  status,
  retry,
}: {
  status: Failure;
  retry?: () => void;
}) {
  const { t } = useLocale();
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger-border bg-surface p-5 text-sm"
    >
      <p>{t(errors[status])}</p>
      {retry && status !== "uncertain" && (
        <Button variant="outline" className="mt-3" onClick={retry}>
          {t("Retry")}
        </Button>
      )}
    </div>
  );
}
export function ReadState({
  result,
  retry,
  children,
}: {
  result: Result | null;
  retry: () => void;
  children: (data: Data) => ReactNode;
}) {
  const { t } = useLocale();
  return !result ? (
    <p
      role="status"
      className="rounded-lg border bg-surface p-6 text-sm text-muted-foreground"
    >
      {t("Loading operations...")}
    </p>
  ) : result.status !== "ready" ? (
    <ErrorState status={result.status} retry={retry} />
  ) : (
    children(result.data)
  );
}
export function Money({
  row,
  field,
  currency,
}: {
  row: Row;
  field: string;
  currency?: string;
}) {
  const { locale } = useLocale();
  return (
    <bdi dir="ltr">
      {displayMoney(
        valueText(row, field),
        currency ?? valueText(row, "currency"),
        locale,
      )}
    </bdi>
  );
}
export function DateTime({ value }: { value: unknown }) {
  const { locale } = useLocale();
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return <>—</>;
  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))}
    </time>
  );
}
export function Pager({
  data,
  onPage,
}: {
  data: Page;
  onPage: (page: number) => void;
}) {
  const { t, locale } = useLocale();
  return (
    <nav
      aria-label={t("Pagination")}
      className="mt-5 flex items-center justify-between gap-3"
    >
      <Button
        variant="outline"
        disabled={data.page <= 1}
        onClick={() => onPage(data.page - 1)}
      >
        {t("Previous page")}
      </Button>
      <span className="text-xs text-muted-foreground">
        {t("Page")} {data.page.toLocaleString(locale)}
      </span>
      <Button
        variant="outline"
        disabled={!data.hasNext}
        onClick={() => onPage(data.page + 1)}
      >
        {t("Next page")}
      </Button>
    </nav>
  );
}
export type Column = { label: TranslationKey; render: (row: Row) => ReactNode };
export function DataTable({
  items,
  columns,
  empty = "No records.",
  actions,
}: {
  items: Row[];
  columns: Column[];
  empty?: TranslationKey;
  actions?: (row: Row) => ReactNode;
}) {
  const { t } = useLocale();
  if (!items.length)
    return (
      <p className="rounded-lg border bg-surface p-8 text-center text-sm text-muted-foreground">
        {t(empty)}
      </p>
    );
  return (
    <div
      className="relative overflow-x-auto rounded-lg border bg-surface focus-visible:outline-2 focus-visible:outline-primary"
      tabIndex={0}
      role="region"
      aria-label={columns.map((column) => t(column.label)).join(", ")}
    >
      <table className="w-full text-start text-sm">
        <thead className="border-b bg-secondary">
          <tr>
            {columns.map((column) => (
              <th
                className="px-4 py-3 text-start font-medium whitespace-nowrap"
                key={column.label}
              >
                {t(column.label)}
              </th>
            ))}
            {actions && (
              <th className="px-4 py-3">
                <span className="sr-only">{t("View details")}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((row) => (
            <tr key={row.id} className="align-top">
              {columns.map((column) => (
                <td
                  className="max-w-xs px-4 py-4 break-words"
                  key={column.label}
                >
                  {column.render(row)}
                </td>
              ))}
              {actions && (
                <td className="px-4 py-3 text-end">{actions(row)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function DetailsGrid({
  entries,
}: {
  entries: { label: TranslationKey; value: ReactNode }[];
}) {
  const { t } = useLocale();
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {entries.map((entry) => (
        <div className="min-w-0" key={entry.label}>
          <dt className="text-xs text-muted-foreground">{t(entry.label)}</dt>
          <dd className="mt-1 break-words text-sm font-medium">
            {entry.value || "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function Panel({
  title,
  children,
  action,
}: {
  title: TranslationKey;
  children: ReactNode;
  action?: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <section className="rounded-lg border bg-surface p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{t(title)}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
export function DetailLink({ href }: { href: string }) {
  const { t } = useLocale();
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>{t("View details")}</Link>
    </Button>
  );
}

export type Field = {
  name: string;
  label: TranslationKey;
  type?:
    | "text"
    | "tel"
    | "number"
    | "money"
    | "textarea"
    | "date"
    | "datetime-local"
    | "checkbox";
  required?: boolean;
  signed?: boolean;
  value?: ScalarValue;
  min?: number;
  max?: number;
  options?: {
    value: string;
    label: TranslationKey | string;
    literal?: boolean;
  }[];
  lookup?: "merchants" | "drivers" | "parcels";
  lookupLabel?: string;
  span?: boolean;
};
type ScalarValue = string | number | boolean | null;
const controlStyle =
  "min-h-10 w-full rounded-md border border-input bg-surface px-3 py-2 text-start text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";
export function EntityPicker({ scope, field }: { scope: Scope; field: Field }) {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(String(field.value ?? ""));
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const { result, retry } = useOperations(scope, {
    resource: field.lookup ?? "merchants",
    query: { search: debounced, page: String(page), pageSize: "25" },
  });
  const data =
    result?.status === "ready" && result.data.kind === "page"
      ? result.data.data
      : null;
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t(field.label)}</Label>
      <Input
        type="search"
        aria-label={t(
          field.lookup === "drivers"
            ? "Find driver"
            : field.lookup === "parcels"
              ? "Find parcel"
              : "Find merchant",
        )}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        maxLength={100}
      />
      <select
        id={id}
        name={field.name}
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        required={field.required}
        className={controlStyle}
      >
        <option value="">{t("Select a record")}</option>
        {selected && !data?.items.some((row) => row.id === selected) && (
          <option value={selected}>{field.lookupLabel ?? selected}</option>
        )}
        {data?.items.map((row) => (
          <option key={row.id} value={row.id}>
            {valueText(row, "name") ||
              valueText(row, "fullName") ||
              valueText(row, "trackingNumber")}
          </option>
        ))}
      </select>
      {!result && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("Loading operations...")}
        </p>
      )}
      {result && result.status !== "ready" && (
        <ErrorState status={result.status} retry={retry} />
      )}
      {data && (data.page > 1 || data.hasNext) && (
        <Pager data={data} onPage={setPage} />
      )}
    </div>
  );
}
function FormField({ field, scope }: { field: Field; scope: Scope }) {
  const { t } = useLocale();
  const id = useId();
  if (field.lookup) return <EntityPicker scope={scope} field={field} />;
  const common = {
    id,
    name: field.name,
    required: field.required,
    defaultValue:
      typeof field.value === "boolean" || field.value === null
        ? undefined
        : field.value,
    className: controlStyle,
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {t(field.label)}
        {!field.required && field.type !== "checkbox" && (
          <span className="ms-1 font-normal text-muted-foreground">
            ({t("Optional")})
          </span>
        )}
      </Label>
      {field.options ? (
        <select {...common}>
          {!field.required && <option value="">—</option>}
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.literal
                ? option.label
                : t(option.label as TranslationKey)}
            </option>
          ))}
        </select>
      ) : field.type === "checkbox" ? (
        <input
          id={id}
          name={field.name}
          type="checkbox"
          defaultChecked={field.value === true}
          className="ms-3 size-5 align-middle accent-primary"
        />
      ) : field.type === "textarea" ? (
        <textarea {...common} maxLength={4000} rows={3} />
      ) : (
        <Input
          {...common}
          type={field.type === "money" ? "text" : (field.type ?? "text")}
          inputMode={field.type === "money" ? "decimal" : undefined}
          pattern={
            field.type === "money"
              ? `${field.signed ? "-?" : ""}[0-9]+(\\.[0-9]{1,3})?`
              : undefined
          }
          min={field.min}
          max={field.max}
          step={field.type === "number" ? "any" : undefined}
          maxLength={field.type === "money" ? 24 : 1000}
        />
      )}
    </div>
  );
}
export function OperationDialog({
  title,
  scope,
  operation,
  fields = [],
  onClose,
  onSaved,
  description,
  children,
  confirmLabel = "Save",
  financial = false,
}: {
  title: TranslationKey;
  scope: Scope;
  operation: Operation;
  fields?: Field[];
  onClose: () => void;
  onSaved: (data: Data, input: Record<string, unknown>) => void;
  description?: TranslationKey;
  children?: ReactNode;
  confirmLabel?: TranslationKey;
  financial?: boolean;
}) {
  const { t } = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const busy = useRef(false);
  const active = useRef(true);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState("");
  const [targetStatus, setTargetStatus] = useState(
    fields.find((field) => field.name === "status")?.options?.[0]?.value ?? "",
  );
  useEffect(() => {
    active.current = true;
    dialog.current?.showModal();
    return () => {
      active.current = false;
    };
  }, []);
  async function submit(form: HTMLFormElement) {
    if (busy.current || result?.status === "uncertain") return;
    const formData = new FormData(form);
    const input: Record<string, unknown> = {
      ...operation.input,
      ...(financial ? { idempotencyKey: requestId } : {}),
    };
    for (const field of fields) {
      const raw = String(formData.get(field.name) ?? "").trim();
      input[field.name] =
        field.type === "checkbox"
          ? formData.has(field.name)
          : field.type === "number"
            ? raw
              ? Number(raw)
              : null
            : field.type === "datetime-local"
              ? raw
                ? new Date(raw).toISOString()
                : null
              : raw || null;
    }
    busy.current = true;
    setPending(true);
    setResult(null);
    try {
      const next = await withSessionLock(() =>
        operationsAction(scope, { ...operation, input }),
      );
      if (!active.current) return;
      if (next.status === "ready") onSaved(next.data, input);
      else setResult(next);
    } catch (error) {
      unstable_rethrow(error);
      if (active.current) setResult({ status: "uncertain" });
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg border bg-surface p-5 text-foreground shadow-lg backdrop:bg-sidebar-navy/55 sm:p-7"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        {t(title)}
      </h2>
      {description && (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t(description)}
        </p>
      )}
      {financial && (
        <p className="mt-3 rounded-md border border-warning/30 bg-warning-subtle p-3 text-sm">
          {t("This action creates a permanent financial audit record.")}
        </p>
      )}
      {children}
      <form
        className="mt-6"
        onChange={(event) => {
          const target = event.target;
          if (target instanceof HTMLSelectElement && target.name === "reason")
            setReason(target.value);
          if (target instanceof HTMLSelectElement && target.name === "outcome")
            setOutcome(target.value);
          if (target instanceof HTMLSelectElement && target.name === "status")
            setTargetStatus(target.value);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void submit(event.currentTarget);
        }}
      >
        <fieldset
          disabled={pending || result?.status === "uncertain"}
          className="grid min-w-0 gap-5 sm:grid-cols-2"
        >
          {fields.map((field) => (
            <div className={field.span ? "sm:col-span-2" : ""} key={field.name}>
              <FormField
                field={{
                  ...field,
                  required:
                    field.required ||
                    (field.name === "note" &&
                      (reason === "OTHER" ||
                        targetStatus === "FAILED_DELIVERY" ||
                        targetStatus === "CANCELLED")) ||
                    (field.name === "reason" && outcome === "FAILED"),
                }}
                scope={scope}
              />
            </div>
          ))}
        </fieldset>
        {result && result.status !== "ready" && (
          <div className="mt-5">
            <ErrorState status={result.status} />
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => dialog.current?.close()}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="submit"
            disabled={pending || result?.status === "uncertain"}
          >
            {t(pending ? "Saving..." : confirmLabel)}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
