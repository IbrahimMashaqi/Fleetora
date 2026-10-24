"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProtectedSession } from "@/features/auth/session/session-context";
import { ErrorState } from "@/features/operations/components/operations-ui";
import { useLocale } from "@/lib/i18n";
import { withSessionLock } from "@/lib/auth/session-lock";
import { useScopedRead } from "@/lib/api/use-scoped-read";
import { requestsAction } from "./requests.action";
import type { RequestResult, Scope } from "./requests.types";
function useCopy() {
  const { locale } = useLocale();
  return (en: string, ar: string) => (locale === "ar" ? ar : en);
}
export function MerchantRequestsWorkspace() {
  const { user } = useProtectedSession();
  if (
    !user.company ||
    !user.orgId ||
    !["COMPANY_ADMIN", "ACCOUNTANT"].includes(user.role)
  )
    return <ErrorState status="forbidden" />;
  const scope = { userId: user.id, companyId: user.orgId };
  return (
    <div
      key={`${user.id}:${user.orgId}:${user.role}`}
      className="mx-auto max-w-5xl space-y-6"
    >
      {user.role === "COMPANY_ADMIN" && (
        <RequestQueue scope={scope} kind="changes" />
      )}
      <RequestQueue scope={scope} kind="settlements" />
    </div>
  );
}
function RequestQueue({
  scope,
  kind,
}: {
  scope: Scope;
  kind: "changes" | "settlements";
}) {
  const c = useCopy(),
    [page, setPage] = useState(1),
    [version, setVersion] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [pending, setPending] = useState(false),
    [feedback, setFeedback] = useState<RequestResult | null>(null),
    lock = useRef(false);
  const result = useScopedRead<RequestResult>(
    JSON.stringify([scope, kind, page, version]),
    () =>
      withSessionLock(() =>
        requestsAction(scope, { kind, action: "list", page }),
      ),
    () => ({ status: "unavailable" }),
  );
  async function reviewed(id: string) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    try {
      const response = await withSessionLock(() =>
        requestsAction(scope, { kind: "settlements", action: "review", id }),
      );
      setFeedback(response);
      if (response.status === "saved") setVersion((v) => v + 1);
    } catch (error) {
      unstable_rethrow(error);
      setFeedback({ status: "uncertain" });
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <section className="rounded-xl border bg-surface p-5">
      <header className="mb-5 flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {kind === "changes"
              ? c(
                  "Merchant amendment & cancellation requests",
                  "طلبات تعديل وإلغاء الطرود",
                )
              : c("Merchant settlement requests", "طلبات تسوية التجار")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {kind === "changes"
              ? c(
                  "Review the proposed changes and their contractual pricing before approval.",
                  "راجع التغييرات المقترحة وأسعارها التعاقدية قبل الموافقة.",
                )
              : c(
                  "Review records the request only. Use the existing settlement workflow for approval and actual payment.",
                  "تسجّل المراجعة الطلب فقط. استخدم مسار التسوية الحالي للاعتماد والدفع الفعلي.",
                )}
          </p>
        </div>
        <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
          {c("Refresh requests", "تحديث الطلبات")}
        </Button>
      </header>
      {!result && (
        <p role="status">{c("Loading requests…", "تحميل الطلبات…")}</p>
      )}
      {result &&
        result.status !== "ready" &&
        result.status !== "preview" &&
        result.status !== "saved" && (
          <ErrorState
            status={result.status}
            retry={() => setVersion((v) => v + 1)}
          />
        )}
      {feedback?.status === "saved" && (
        <p role="status" className="mb-4 rounded-md bg-success-subtle p-3">
          {c(
            "Request marked reviewed. No money was paid.",
            "تم تسجيل مراجعة الطلب. لم يُدفع أي مبلغ.",
          )}
        </p>
      )}
      {feedback &&
        feedback.status !== "saved" &&
        feedback.status !== "ready" &&
        feedback.status !== "preview" && (
          <ErrorState status={feedback.status} />
        )}
      {result?.status === "ready" && (
        <>
          <ul className="space-y-3">
            {result.items.length === 0 && (
              <li className="py-5 text-center text-muted-foreground">
                {c("No pending requests.", "لا توجد طلبات معلّقة.")}
              </li>
            )}
            {result.items.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
              >
                <div className="space-y-2">
                  <p className="font-medium">
                    {row.kind === "AMEND"
                      ? c("Parcel amendment", "تعديل طرد")
                      : row.kind === "CANCEL"
                        ? c(
                            "Cancellation / documented return",
                            "إلغاء / مرتجع موثق",
                          )
                        : c("Settlement review", "مراجعة تسوية")}
                  </p>
                  <p className="max-w-xl break-words text-sm">
                    {row.reason || "—"}
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <Link
                      className="underline"
                      href={`/app/merchants/${row.merchantId}`}
                    >
                      {c("Merchant details", "تفاصيل التاجر")}
                    </Link>
                    {row.shipmentId && (
                      <Link
                        className="underline"
                        href={`/app/parcels/${row.shipmentId}`}
                      >
                        {c("Parcel details", "تفاصيل الطرد")}
                      </Link>
                    )}
                  </div>
                </div>
                {kind === "changes" ? (
                  <Button onClick={() => setSelected(row.id)}>
                    {c("Review financial impact", "مراجعة الأثر المالي")}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      void reviewed(row.id);
                    }}
                  >
                    {c("Mark reviewed", "تسجيل المراجعة")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <nav
            aria-label={c("Request pagination", "صفحات الطلبات")}
            className="mt-4 flex items-center justify-between gap-3"
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
        <ReviewDialog
          scope={scope}
          id={selected}
          close={() => {
            setSelected(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </section>
  );
}
function ReviewDialog({
  scope,
  id,
  close,
}: {
  scope: Scope;
  id: string;
  close(): void;
}) {
  const c = useCopy(),
    ref = useRef<HTMLDialogElement>(null),
    lock = useRef(false),
    [pending, setPending] = useState(false),
    [feedback, setFeedback] = useState<RequestResult | null>(null),
    [version, setVersion] = useState(0);
  const result = useScopedRead<RequestResult>(
    JSON.stringify([scope, id, version]),
    () =>
      withSessionLock(() =>
        requestsAction(scope, { kind: "changes", action: "preview", id }),
      ),
    () => ({ status: "unavailable" }),
  );
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || result?.status !== "preview") return;
    const form = new FormData(event.currentTarget),
      action = form.get("decision");
    if (action !== "APPROVE" && action !== "REJECT") return;
    lock.current = true;
    setPending(true);
    try {
      const response = await withSessionLock(() =>
        requestsAction(scope, {
          kind: "changes",
          action: "review",
          id,
          input: {
            action,
            parcelRevision: result.preview.parcelRevision,
            pricingVersion: result.preview.pricingVersion ?? undefined,
            reason: String(form.get("reason") ?? "").trim(),
          },
        }),
      );
      setFeedback(response);
      if (response.status === "saved") close();
    } catch (error) {
      unstable_rethrow(error);
      setFeedback({ status: "uncertain" });
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby="request-review-title"
      onCancel={(event) => {
        if (pending) event.preventDefault();
        else close();
      }}
      className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border bg-surface p-5 text-foreground shadow-lg backdrop:bg-sidebar-navy/50"
    >
      <div className="mb-5 flex justify-between gap-3">
        <h2 id="request-review-title" className="text-xl font-semibold">
          {c("Review merchant request", "مراجعة طلب التاجر")}
        </h2>
        <Button variant="outline" disabled={pending} onClick={close}>
          {c("Close", "إغلاق")}
        </Button>
      </div>
      {!result && (
        <p role="status">
          {c("Loading current pricing…", "تحميل التسعير الحالي…")}
        </p>
      )}
      {result &&
        result.status !== "preview" &&
        result.status !== "ready" &&
        result.status !== "saved" && (
          <ErrorState
            status={result.status}
            retry={() => setVersion((v) => v + 1)}
          />
        )}
      {result?.status === "preview" && (
        <>
          <p className="mb-4 text-sm">{result.preview.request.reason}</p>
          <dl className="space-y-3 rounded-lg border p-4 text-sm">
            <dt className="font-medium">
              {c("Current address", "العنوان الحالي")}
            </dt>
            <dd>{result.preview.oldDestination}</dd>
            {result.preview.proposedDestination && (
              <>
                <dt className="font-medium">
                  {c("Proposed address", "العنوان المقترح")}
                </dt>
                <dd>{result.preview.proposedDestination}</dd>
              </>
            )}
            <dt className="font-medium">
              {c("Previous contractual fee", "الرسوم التعاقدية السابقة")}
            </dt>
            <dd>
              <bdi>
                {result.preview.previousFee} {result.preview.currency}
              </bdi>
            </dd>
            <dt className="font-medium">
              {c("Proposed contractual fee", "الرسوم التعاقدية المقترحة")}
            </dt>
            <dd>
              <bdi>
                {result.preview.proposedFee ?? "—"} {result.preview.currency}
              </bdi>
            </dd>
            <dt className="font-medium">
              {c("Final customer payment", "المبلغ النهائي على العميل")}
            </dt>
            <dd>
              <bdi>
                {result.preview.finalCustomerAmount ?? "—"}{" "}
                {result.preview.currency}
              </bdi>
            </dd>
          </dl>
          {result.preview.request.kind === "CANCEL" && (
            <p className="my-4 text-sm">
              {c(
                "Approval starts the documented return workflow. Physical custody and return fees remain governed by normal handoff confirmations.",
                "تبدأ الموافقة مسار المرتجع الموثق. تظل العهدة ورسوم المرتجع مرتبطة بتأكيدات التسليم الفعلية.",
              )}
            </p>
          )}
          {feedback &&
            feedback.status !== "saved" &&
            feedback.status !== "ready" &&
            feedback.status !== "preview" && (
              <ErrorState status={feedback.status} />
            )}
          {!result.preview.canApprove && (
            <p role="status" className="mt-4 text-sm">
              {c(
                "This request cannot currently be approved. Refresh the data or reject it with an explanation.",
                "لا يمكن الموافقة على الطلب حاليًا. حدّث البيانات أو ارفضه مع توضيح السبب.",
              )}
            </p>
          )}
          {result.preview.request.kind === "CANCEL" && (
            <p className="mt-4 text-sm">
              {c(
                "Contractual return fee, charged only after confirmed merchant handoff: ",
                "رسوم المرتجع التعاقدية، تُقيّد بعد تأكيد إعادته للتاجر فقط: ",
              )}
              <bdi>
                {result.preview.returnFee} {result.preview.currency}
              </bdi>
            </p>
          )}
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <Label htmlFor="review-decision">
                {c("Explicit decision", "القرار الصريح")}
              </Label>
              <select
                id="review-decision"
                name="decision"
                required
                disabled={pending}
                defaultValue=""
                className="min-h-10 w-full rounded-md border bg-surface px-3"
              >
                <option value="">{c("Select decision", "اختر القرار")}</option>
                <option value="APPROVE" disabled={!result.preview.canApprove}>
                  {c(
                    "Approve reviewed changes",
                    "الموافقة على التغييرات المراجعة",
                  )}
                </option>
                <option value="REJECT">
                  {c("Reject request", "رفض الطلب")}
                </option>
              </select>
            </div>
            <div>
              <Label htmlFor="review-reason">
                {c("Review reason", "سبب القرار")}
              </Label>
              <Input
                id="review-reason"
                name="reason"
                required
                minLength={3}
                maxLength={500}
                disabled={pending}
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending
                ? c("Saving…", "جارٍ الحفظ…")
                : c("Record decision", "تسجيل القرار")}
            </Button>
          </form>
        </>
      )}
    </dialog>
  );
}
