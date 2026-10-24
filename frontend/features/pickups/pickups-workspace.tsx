"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProtectedSession } from "@/features/auth/session/session-context";
import {
  EntityPicker,
  ErrorState,
} from "@/features/operations/components/operations-ui";
import { useLocale } from "@/lib/i18n";
import { withSessionLock } from "@/lib/auth/session-lock";
import { pickupsAction } from "./pickups.action";
import type {
  Pickup,
  PickupOperation,
  PickupResult,
  Receipts,
  Scope,
} from "./pickups.types";
const control =
  "min-h-10 w-full rounded-md border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
function useCopy() {
  const { locale } = useLocale();
  return (en: string, ar: string) => (locale === "ar" ? ar : en);
}
function usePickups(scope: Scope, operation: PickupOperation, version: number) {
  const key = JSON.stringify([scope, operation, version]);
  const [value, setValue] = useState<{
    key: string;
    result: PickupResult;
  } | null>(null);
  const pending = useRef<{ key: string; task: Promise<PickupResult> } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    if (pending.current?.key !== key)
      pending.current = {
        key,
        task: withSessionLock(() => pickupsAction(scope, operation)),
      };
    void pending.current.task
      .then((result) => {
        if (active)
          setValue((previous) =>
            previous?.key === key ? previous : { key, result },
          );
      })
      .catch((error) => {
        unstable_rethrow(error);
        if (active)
          setValue((previous) =>
            previous?.key === key
              ? previous
              : { key, result: { status: "unavailable" } },
          );
      });
    return () => {
      active = false;
    };
  }, [key, scope, operation]);
  return value?.key === key ? value.result : null;
}
function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}
function Status({ value }: { value: Pickup["status"] }) {
  const c = useCopy();
  const copy = {
    REQUESTED: c("Awaiting company review", "بانتظار مراجعة الشركة"),
    PROPOSED: c("Alternative window proposed", "موعد بديل مقترح"),
    CONFIRMED: c("Confirmed window", "موعد مؤكد"),
    RECEIVED: c("Receipt recorded", "سُجّل الاستلام"),
    CANCELLED: c("Cancelled", "ملغي"),
  };
  return (
    <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
      {copy[value]}
    </span>
  );
}
export function PickupsWorkspace() {
  const { user } = useProtectedSession();
  if (user.role !== "COMPANY_ADMIN" || !user.company || !user.orgId)
    return <ErrorState status="forbidden" />;
  return (
    <PickupDirectory
      key={`${user.id}:${user.orgId}`}
      scope={{ userId: user.id, companyId: user.orgId }}
    />
  );
}
function PickupDirectory({ scope }: { scope: Scope }) {
  const c = useCopy();
  const [page, setPage] = useState(1),
    [version, setVersion] = useState(0),
    [selected, setSelected] = useState<string | null>(null);
  const result = usePickups(scope, { action: "list", page }, version);
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">
            {c("Pickup requests", "طلبات الاستلام")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {c(
              "Review merchant preferences and record the parcels physically received.",
              "راجع الأوقات المفضلة للتاجر وسجّل الطرود التي استُلمت فعليًا.",
            )}
          </p>
        </div>
        <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
          {c("Refresh", "تحديث")}
        </Button>
      </header>
      {!result && (
        <p role="status">
          {c("Loading pickup requests…", "تحميل طلبات الاستلام…")}
        </p>
      )}
      {result && result.status !== "ready" && result.status !== "detail" && (
        <ErrorState
          status={result.status}
          retry={() => setVersion((v) => v + 1)}
        />
      )}
      {result?.status === "ready" && (
        <>
          <div className="overflow-x-auto rounded-lg border bg-surface">
            <table className="w-full text-start text-sm">
              <thead className="bg-secondary">
                <tr>
                  {[
                    c("Request", "الطلب"),
                    c("Method", "الطريقة"),
                    c("Preferred window", "الوقت المفضل"),
                    c("Status", "الحالة"),
                    c("Actions", "الإجراءات"),
                  ].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="p-4 text-start font-medium"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.items.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-4">
                      <p>{p.pickupAddress}</p>
                      <bdi dir="ltr" className="text-xs text-muted-foreground">
                        {p.id.slice(0, 8)}
                      </bdi>
                    </td>
                    <td className="p-4">
                      {p.method === "COMPANY_PICKUP"
                        ? c("Company pickup", "استلام الشركة")
                        : c("Warehouse drop-off", "تسليم المستودع")}
                    </td>
                    <td className="p-4">
                      <p>{date(p.preferredFrom)}</p>
                      <p>{date(p.preferredTo)}</p>
                    </td>
                    <td className="p-4">
                      <Status value={p.status} />
                    </td>
                    <td className="p-4">
                      <Button
                        variant="outline"
                        onClick={() => setSelected(p.id)}
                      >
                        {c("Review request", "مراجعة الطلب")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.items.length === 0 && (
              <p className="p-8 text-center text-muted-foreground">
                {c(
                  "No pickup requests on this page.",
                  "لا توجد طلبات استلام في هذه الصفحة.",
                )}
              </p>
            )}
          </div>
          <nav
            aria-label={c("Pagination", "التنقل بين الصفحات")}
            className="flex items-center justify-between gap-3"
          >
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {c("Previous", "السابق")}
            </Button>
            <span>{page}</span>
            <Button
              variant="outline"
              disabled={!result.hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              {c("Next", "التالي")}
            </Button>
          </nav>
        </>
      )}
      {selected && (
        <PickupDialog
          key={selected}
          scope={scope}
          id={selected}
          close={() => {
            setSelected(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
function PickupDialog({
  scope,
  id,
  close,
}: {
  scope: Scope;
  id: string;
  close(): void;
}) {
  const c = useCopy();
  const ref = useRef<HTMLDialogElement>(null),
    locked = useRef(false);
  const [version, setVersion] = useState(0),
    [pending, setPending] = useState(false),
    [feedback, setFeedback] = useState<PickupResult | null>(null);
  const result = usePickups(scope, { action: "detail", id }, version);
  const [mode, setMode] = useState<
    "CONFIRM" | "PROPOSE" | "CANCEL" | "RECEIPTS"
  >("CONFIRM");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || result?.status !== "detail") return;
    const form = new FormData(event.currentTarget),
      pickup = result.pickup;
    const optional = (name: string) => {
      const value = String(form.get(name) ?? "").trim();
      return value || undefined;
    };
    let operation: PickupOperation;
    if (mode === "RECEIPTS") {
      const parcels: Receipts["parcels"] = [];
      for (const item of pickup.parcels ?? []) {
        const receipt = form.get(`receipt:${item.shipmentId}`);
        if (
          receipt === "RECEIVED" ||
          receipt === "MISSING" ||
          receipt === "DISCREPANT"
        )
          parcels.push({
            parcelId: item.shipmentId,
            receipt,
            notes: optional(`note:${item.shipmentId}`),
          });
      }
      if (!parcels.length) return;
      operation = {
        action: "receipts",
        id,
        input: { revision: pickup.revision, parcels },
      };
    } else {
      const toUtc = (name: string) => {
        const input = optional(name);
        return input ? new Date(input).toISOString() : undefined;
      };
      operation = {
        action: "review",
        id,
        input: {
          revision: pickup.revision,
          action: mode,
          ...(mode !== "CANCEL"
            ? { from: toUtc("from"), to: toUtc("to") }
            : {}),
          workerId: optional("workerId"),
          warehouseId: optional("warehouseId"),
          reason: optional("reason"),
        },
      };
    }
    locked.current = true;
    setPending(true);
    setFeedback(null);
    try {
      const response = await withSessionLock(() =>
        pickupsAction(scope, operation),
      );
      setFeedback(response);
      if (response.status === "detail") setVersion((v) => v + 1);
    } catch (error) {
      unstable_rethrow(error);
      setFeedback({ status: "uncertain" });
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby="pickup-dialog-title"
      onCancel={(event) => {
        if (pending) event.preventDefault();
        else close();
      }}
      onClose={() => {
        if (!pending) close();
      }}
      className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border bg-surface p-5 text-foreground shadow-lg backdrop:bg-sidebar-navy/50"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <h2 id="pickup-dialog-title" className="text-xl font-semibold">
          {c("Review pickup request", "مراجعة طلب الاستلام")}
        </h2>
        <Button variant="outline" disabled={pending} onClick={close}>
          {c("Close", "إغلاق")}
        </Button>
      </div>
      {!result && <p role="status">{c("Loading…", "جارٍ التحميل…")}</p>}
      {result && result.status !== "detail" && result.status !== "ready" && (
        <ErrorState
          status={result.status}
          retry={() => setVersion((v) => v + 1)}
        />
      )}
      {result?.status === "detail" && (
        <>
          <Status value={result.pickup.status} />
          <p className="mt-4 font-medium">{result.pickup.pickupAddress}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.pickup.notes}
          </p>
          <dl className="my-5 grid gap-4 text-sm sm:grid-cols-2">
            {[
              [
                c("Preferred window", "الوقت المفضل"),
                result.pickup.preferredFrom,
                result.pickup.preferredTo,
              ],
              [
                c("Proposed window", "الوقت المقترح"),
                result.pickup.proposedFrom,
                result.pickup.proposedTo,
              ],
              [
                c("Confirmed window", "الوقت المؤكد"),
                result.pickup.confirmedFrom,
                result.pickup.confirmedTo,
              ],
            ].map(([label, from, to]) => (
              <div key={label}>
                <dt className="font-medium">{label}</dt>
                <dd>
                  {date(from ?? null)}
                  <br />
                  {date(to ?? null)}
                </dd>
              </div>
            ))}
          </dl>
          <ul className="mb-5 space-y-2">
            {result.pickup.parcels?.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <Link
                  className="underline"
                  href={`/app/parcels/${p.shipmentId}`}
                >
                  {c("Parcel", "طرد")} <bdi>{p.shipmentId.slice(0, 8)}</bdi>
                </Link>
                <span>
                  {p.receipt === "PENDING"
                    ? c("Awaiting receipt", "بانتظار الاستلام")
                    : p.receipt === "RECEIVED"
                      ? c("Received", "مستلم")
                      : p.receipt === "MISSING"
                        ? c("Missing", "ناقص")
                        : c("Discrepancy", "اختلاف")}
                </span>
                {p.receiptNotes && <p>{p.receiptNotes}</p>}
              </li>
            ))}
          </ul>
          {feedback?.status === "detail" && (
            <p role="status" className="mb-4 rounded-md bg-success-subtle p-3">
              {c("Request updated.", "تم تحديث الطلب.")}
            </p>
          )}
          {feedback &&
            feedback.status !== "detail" &&
            feedback.status !== "ready" && (
              <ErrorState status={feedback.status} />
            )}
          {!["RECEIVED", "CANCELLED"].includes(result.pickup.status) && (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="pickup-action">{c("Action", "الإجراء")}</Label>
                <select
                  id="pickup-action"
                  className={control}
                  value={mode}
                  disabled={pending}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (
                      value === "CONFIRM" ||
                      value === "PROPOSE" ||
                      value === "CANCEL" ||
                      value === "RECEIPTS"
                    )
                      setMode(value);
                  }}
                >
                  <option value="CONFIRM">
                    {c("Confirm a window", "تأكيد وقت")}
                  </option>
                  <option value="PROPOSE">
                    {c("Propose another window", "اقتراح وقت بديل")}
                  </option>
                  {result.pickup.status === "CONFIRMED" && (
                    <option value="RECEIPTS">
                      {c("Record physical receipt", "تسجيل الاستلام الفعلي")}
                    </option>
                  )}
                  <option value="CANCEL">
                    {c("Cancel request", "إلغاء الطلب")}
                  </option>
                </select>
              </div>
              {mode === "RECEIPTS" ? (
                <div className="space-y-3">
                  <p className="text-sm">
                    {c(
                      "Choose only the parcels you have physically checked. Missing and discrepant entries require notes.",
                      "حدد فقط الطرود التي تحققت منها فعليًا. يلزم توضيح للطرود الناقصة أو المختلفة.",
                    )}
                  </p>
                  {result.pickup.parcels
                    ?.filter((p) => p.receipt === "PENDING")
                    .map((p) => (
                      <ReceiptFields
                        key={p.id}
                        shipmentId={p.shipmentId}
                        pending={pending}
                      />
                    ))}
                </div>
              ) : mode !== "CANCEL" ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="pickup-from">
                        {c("Window start", "بداية الوقت")}
                      </Label>
                      <Input
                        id="pickup-from"
                        name="from"
                        type="datetime-local"
                        required
                        disabled={pending}
                      />
                    </div>
                    <div>
                      <Label htmlFor="pickup-to">
                        {c("Window end", "نهاية الوقت")}
                      </Label>
                      <Input
                        id="pickup-to"
                        name="to"
                        type="datetime-local"
                        required
                        disabled={pending}
                      />
                    </div>
                  </div>
                  <EntityPicker
                    scope={scope}
                    field={{
                      name: "workerId",
                      label: "Drivers",
                      lookup: "drivers",
                    }}
                  />
                </>
              ) : (
                <div>
                  <Label htmlFor="pickup-reason">
                    {c("Cancellation reason", "سبب الإلغاء")}
                  </Label>
                  <Input
                    id="pickup-reason"
                    name="reason"
                    required
                    maxLength={500}
                    disabled={pending}
                  />
                </div>
              )}
              <Button type="submit" disabled={pending}>
                {pending
                  ? c("Saving…", "جارٍ الحفظ…")
                  : c("Save reviewed action", "حفظ الإجراء المراجع")}
              </Button>
            </form>
          )}
        </>
      )}
    </dialog>
  );
}
function ReceiptFields({
  shipmentId,
  pending,
}: {
  shipmentId: string;
  pending: boolean;
}) {
  const c = useCopy();
  const [receipt, setReceipt] = useState("");
  return (
    <fieldset disabled={pending} className="space-y-2 rounded-md border p-3">
      <legend className="text-sm">
        <bdi>{shipmentId.slice(0, 8)}</bdi>
      </legend>
      <Label htmlFor={`receipt-${shipmentId}`}>
        {c("Receipt result", "نتيجة الاستلام")}
      </Label>
      <select
        id={`receipt-${shipmentId}`}
        name={`receipt:${shipmentId}`}
        className={control}
        value={receipt}
        onChange={(event) => setReceipt(event.target.value)}
      >
        <option value="">{c("Not reviewed", "لم يُراجع")}</option>
        <option value="RECEIVED">
          {c("Physically received", "استُلم فعليًا")}
        </option>
        <option value="MISSING">{c("Missing", "ناقص")}</option>
        <option value="DISCREPANT">
          {c("Received with discrepancy", "استُلم مع اختلاف")}
        </option>
      </select>
      <Label htmlFor={`note-${shipmentId}`}>
        {c("Receipt notes", "ملاحظات الاستلام")}
      </Label>
      <Input
        id={`note-${shipmentId}`}
        name={`note:${shipmentId}`}
        required={receipt === "MISSING" || receipt === "DISCREPANT"}
        maxLength={500}
      />
    </fieldset>
  );
}
