"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { SessionGate } from "@/features/auth/session/session-gate";
import { LogoutControl } from "@/features/auth/logout/logout-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompanyDialog } from "./company-dialog";
import { LanguageSwitcher, useLocale } from "@/lib/i18n";
import { useDebouncedSearch } from "@/lib/use-debounced-search";
import {
  isPlatformMe,
  record,
  type PlatformMe,
} from "@/features/platform/platform-contract";
import { useCompanyRequest } from "./company-client";
import {
  isCompany,
  isCompanyDetails,
  type Company,
  type CompanyDetails,
} from "./company-contract";
import { CompanyFields, basicCompanyInput } from "./company-fields";
import { companyErrors, companyStatuses, companyEvents } from "./company-copy";
type PageData = { items: Company[]; page: number; hasNext: boolean };
export function PlatformCompanies({ id }: { id?: string }) {
  const { locale } = useLocale();
  return (
    <SessionGate loginPath="/platform/login">
      {(user) =>
        user.role === "PLATFORM_ADMIN" ? (
          <Companies key={`${user.id}:${id ?? "directory"}`} id={id} />
        ) : (
          <main className="p-8">
            <p role="alert">
              {locale === "ar"
                ? "يلزم حساب منصة Fleetora للوصول."
                : "Platform access required"}
            </p>
            <Link href="/app">
              {locale === "ar" ? "العودة إلى الشركة" : "Back to company"}
            </Link>
          </main>
        )
      }
    </SessionGate>
  );
}
function Companies({ id }: { id?: string }) {
  const { locale } = useLocale(),
    c = (en: string, ar: string) => (locale === "ar" ? ar : en),
    request = useCompanyRequest(true),
    search = useDebouncedSearch();
  const [identity, setIdentity] = useState<PlatformMe | null>(null),
    [data, setData] = useState<PageData | null>(null),
    [details, setDetails] = useState<CompanyDetails | null>(null),
    [error, setError] = useState(""),
    [completedRead, setCompletedRead] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [reload, setReload] = useState(0),
    [create, setCreate] = useState(false),
    [reasonAction, setReasonAction] = useState<"reject" | "suspend" | null>(
      null,
    ),
    [invitation, setInvitation] = useState<{
      url?: string;
      delivery: string;
    } | null>(null),
    [copied, setCopied] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let current = true;
    request({ action: "me" }).then((result) => {
      if (!current) return;
      if (result.status === "ready" && isPlatformMe(result.data)) {
        setIdentity(result.data);
        if (result.data.role === "BILLING") {
          setError("forbidden");
        }
      } else {
        setError(String(result.status));
      }
    });
    return () => {
      current = false;
    };
  }, [request]);
  const readable = identity && identity.role !== "BILLING",
    writable =
      identity &&
      (identity.role === "SUPER_ADMIN" || identity.role === "COMPANY_MANAGER");
  const readKey = JSON.stringify([id, page, status, search.search, reload]);
  const loading =
    (!identity && !error) || (!!readable && completedRead !== readKey);
  useEffect(() => {
    if (!readable) return;
    let current = true;
    request(
      id
        ? { action: "company", id }
        : {
            action: "companies",
            page,
            pageSize: 25,
            search: search.search,
            status,
          },
    ).then((result) => {
      if (!current) return;
      setCompletedRead(readKey);
      setError("");
      if (result.status !== "ready") {
        setError(String(result.status));
        setDetails(null);
        setData(null);
        return;
      }
      if (id && isCompanyDetails(result.data) && result.data.company.id === id)
        setDetails(result.data);
      else if (
        !id &&
        record(result.data) &&
        Array.isArray(result.data.items) &&
        result.data.items.every(isCompany) &&
        typeof result.data.page === "number" &&
        typeof result.data.hasNext === "boolean"
      )
        setData({
          items: result.data.items,
          page: result.data.page,
          hasNext: result.data.hasNext,
        });
      else setError("unavailable");
    });
    return () => {
      current = false;
    };
  }, [request, id, readable, page, status, search.search, reload, readKey]);
  const mutate = useCallback(
    async (operation: Record<string, unknown>) => {
      if (lock.current) return false;
      lock.current = true;
      setBusy(true);
      setError("");
      try {
        const result = await request(operation);
        if (
          result.status !== "ready" ||
          !record(result.data) ||
          !isCompany(result.data.company)
        ) {
          setError(String(result.status));
          return false;
        }
        const updated = result.data.company;
        if (isCompany(updated) && id)
          setDetails((previous) =>
            previous ? { ...previous, company: updated } : previous,
          );
        if (["EMAIL", "MANUAL"].includes(String(result.data.delivery))) {
          setInvitation({
            delivery: String(result.data.delivery),
            ...(typeof result.data.activationUrl === "string"
              ? { url: result.data.activationUrl }
              : {}),
          });
          setCopied(false);
        }
        setReload((v) => v + 1);
        return true;
      } finally {
        setBusy(false);
        lock.current = false;
      }
    },
    [request, id],
  );
  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      input = new FormData(form);
    if (
      await mutate({
        action: "createCompany",
        ...basicCompanyInput(form),
        currency: input.get("currency"),
        adminName: input.get("adminName"),
        adminEmail: input.get("adminEmail"),
      })
    ) {
      form.reset();
      setCreate(false);
    }
  }
  async function transition(
    action: "approve" | "reject" | "suspend" | "reactivate",
    reason?: string,
  ) {
    if (!details) return;
    if (
      await mutate({
        action: "transitionCompany",
        id,
        transition: action,
        revision: details.company.revision,
        ...(reason ? { reason } : {}),
      })
    )
      setReasonAction(null);
  }
  const statusLabel = (value: string) =>
    c(...(companyStatuses[value] ?? [value, value]));
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border bg-sidebar-navy px-4 py-4 text-sidebar-foreground sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Link href="/platform" className="text-lg font-semibold text-primary">
            Fleetora
          </Link>
          <nav className="flex flex-wrap items-center gap-4">
            <Link href="/platform/companies">{c("Companies", "الشركات")}</Link>
            <LanguageSwitcher />
            <LogoutControl />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">
            {id
              ? c("Company details", "تفاصيل الشركة")
              : c("Companies", "الشركات")}
          </h1>
          {!id && writable && (
            <Button onClick={() => setCreate(true)}>
              {c("Create company", "إنشاء شركة")}
            </Button>
          )}
          {id && (
            <Link href="/platform/companies">
              {c("Back to companies", "العودة إلى الشركات")}
            </Link>
          )}
        </div>
        {error && (
          <div role="alert" className="rounded-xl border border-border p-4">
            <p>{c(...(companyErrors[error] ?? companyErrors.unavailable))}</p>
            <Button variant="outline" onClick={() => setReload((v) => v + 1)}>
              {c("Retry", "إعادة المحاولة")}
            </Button>
          </div>
        )}
        {!id && readable && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company-search">
                {c("Search companies", "البحث عن الشركات")}
              </Label>
              <Input
                id="company-search"
                type="search"
                value={search.text}
                onChange={(e) => {
                  search.setText(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-status">{c("Status", "الحالة")}</Label>
              <select
                id="company-status"
                className="h-10 w-full rounded-md border border-border bg-surface px-3"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{c("All statuses", "جميع الحالات")}</option>
                {Object.keys(companyStatuses).map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {loading && <p role="status">{c("Loading…", "جارٍ التحميل…")}</p>}
        {!id && data && (
          <section aria-busy={loading} className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-4 text-start">{c("Company", "الشركة")}</th>
                    <th className="p-4 text-start">{c("Status", "الحالة")}</th>
                    <th className="p-4 text-start">{c("Phone", "الهاتف")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((company) => (
                    <tr
                      key={company.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="p-4">
                        <Link
                          className="underline underline-offset-4"
                          href={`/platform/companies/${company.id}`}
                        >
                          {company.name}
                        </Link>
                      </td>
                      <td className="p-4">{statusLabel(company.status)}</td>
                      <td className="p-4">
                        <bdi>{company.phone ?? "—"}</bdi>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.items.length && (
                <p className="p-5">
                  {c("No companies found.", "لم يتم العثور على شركات.")}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                disabled={page === 1 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                {c("Previous", "السابق")}
              </Button>
              <span>
                {c("Page", "صفحة")} {data.page}
              </span>
              <Button
                variant="outline"
                disabled={!data.hasNext || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                {c("Next", "التالي")}
              </Button>
            </div>
          </section>
        )}
        {details && readable && (
          <>
            <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold">{details.company.name}</h2>
              <p>{statusLabel(details.company.status)}</p>
              {details.company.rejectionReason && (
                <p>{details.company.rejectionReason}</p>
              )}
              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  [c("Phone", "الهاتف"), details.company.phone],
                  [c("Address", "العنوان"), details.company.address],
                  [c("Currency", "العملة"), details.company.currency],
                  [c("Plan", "الخطة"), details.company.plan],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd>{value || "—"}</dd>
                  </div>
                ))}
              </dl>
              {writable && (
                <div className="flex flex-wrap gap-3">
                  {details.company.status === "PENDING" && (
                    <>
                      <Button
                        disabled={busy}
                        onClick={() => transition("approve")}
                      >
                        {c("Approve company", "الموافقة على الشركة")}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setReasonAction("reject")}
                      >
                        {c("Reject company", "رفض الشركة")}
                      </Button>
                    </>
                  )}
                  {details.company.status === "ACTIVE" && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => setReasonAction("suspend")}
                    >
                      {c("Suspend company", "إيقاف الشركة")}
                    </Button>
                  )}
                  {details.company.status === "SUSPENDED" && (
                    <Button
                      disabled={busy}
                      onClick={() => transition("reactivate")}
                    >
                      {c("Reactivate company", "إعادة تفعيل الشركة")}
                    </Button>
                  )}
                </div>
              )}
            </section>
            <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold">
                {c("Company administrators", "مديرو الشركة")}
              </h2>
              {!details.admins.length && (
                <p>{c("No administrators found.", "لا يوجد مديرون.")}</p>
              )}
              {details.admins.map((admin) => (
                <div key={admin.id}>
                  <p>
                    {admin.name}{" "}
                    {admin.id === details.primaryAdminId && (
                      <span>· {c("Primary admin", "المدير الأساسي")}</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <bdi>{admin.email ?? "—"}</bdi> ·{" "}
                    {admin.active && admin.verified
                      ? c("Activated", "مفعّل")
                      : c("Awaiting activation", "بانتظار التفعيل")}
                  </p>
                  {writable &&
                    details.company.status === "ACTIVE" &&
                    admin.id === details.primaryAdminId &&
                    !admin.active &&
                    !admin.verified && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          mutate({ action: "reissueCompanyAdmin", id })
                        }
                      >
                        {c(
                          "Reissue admin invitation",
                          "إعادة إرسال دعوة المدير",
                        )}
                      </Button>
                    )}
                </div>
              ))}
            </section>
            <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold">
                {c("Company access history", "سجل وصول الشركة")}
              </h2>
              {details.events.length ? (
                details.events.map((event) => (
                  <p key={event.id}>
                    {c(
                      ...(companyEvents[event.action] ?? [
                        "Company access updated",
                        "تحديث وصول الشركة",
                      ]),
                    )}{" "}
                    ·{" "}
                    {new Date(event.createdAt).toLocaleString(
                      locale === "ar" ? "ar-PS" : "en-GB",
                    )}
                    {record(event.details) &&
                      typeof event.details.reason === "string" &&
                      event.details.reason && (
                        <span className="block text-sm text-muted-foreground">
                          {event.details.reason}
                        </span>
                      )}
                  </p>
                ))
              ) : (
                <p>{c("No events yet.", "لا توجد أحداث بعد.")}</p>
              )}
            </section>
          </>
        )}
        {invitation && (
          <section
            role="status"
            className="space-y-3 rounded-xl border border-border bg-surface p-5"
          >
            <p>
              {invitation.delivery === "EMAIL"
                ? c(
                    "Activation invitation sent by email.",
                    "أُرسلت دعوة التفعيل بالبريد الإلكتروني.",
                  )
                : c(
                    "Email is unavailable. Share the activation link securely with the primary admin.",
                    "البريد غير متاح. شارك رابط التفعيل بأمان مع المدير الأساسي.",
                  )}
            </p>
            {invitation.url && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    if (invitation.url)
                      await navigator.clipboard.writeText(invitation.url);
                    setCopied(true);
                  } catch {
                    setError("unavailable");
                  }
                }}
              >
                {copied
                  ? c("Copied", "تم النسخ")
                  : c("Copy activation link", "نسخ رابط التفعيل")}
              </Button>
            )}
          </section>
        )}
        <CompanyDialog
          title={c("Create company", "إنشاء شركة")}
          description={c(
            "The primary administrator activates their account using an email invitation.",
            "يُفعّل المدير الأساسي حسابه عبر دعوة بالبريد الإلكتروني.",
          )}
          busy={busy}
          open={create}
          onOpenChange={(open) => {
            if (!busy) setCreate(open);
          }}
        >
          <form onSubmit={createCompany} className="space-y-4">
            <fieldset disabled={busy} className="space-y-4">
              <CompanyFields />
              <div className="space-y-2">
                <Label htmlFor="company-currency">
                  {c("Company currency", "عملة الشركة")}
                </Label>
                <select
                  id="company-currency"
                  name="currency"
                  defaultValue="ILS"
                  className="h-10 w-full rounded-md border border-border bg-surface px-3"
                >
                  {["ILS", "USD", "EUR", "JOD"].map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="primary-name">
                  {c("Primary admin name", "اسم المدير الأساسي")}
                </Label>
                <Input
                  id="primary-name"
                  name="adminName"
                  minLength={2}
                  maxLength={120}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="primary-email">
                  {c("Primary admin email", "بريد المدير الأساسي")}
                </Label>
                <Input
                  id="primary-email"
                  name="adminEmail"
                  type="email"
                  dir="ltr"
                  maxLength={254}
                  required
                />
              </div>
              <Button type="submit">
                {busy
                  ? c("Creating…", "جارٍ الإنشاء…")
                  : c("Create and send invitation", "إنشاء وإرسال الدعوة")}
              </Button>
            </fieldset>
            {error && (
              <p role="alert">
                {c(...(companyErrors[error] ?? companyErrors.unavailable))}
              </p>
            )}
          </form>
        </CompanyDialog>
        <CompanyDialog
          title={
            reasonAction === "reject"
              ? c("Reject company", "رفض الشركة")
              : c("Suspend company", "إيقاف الشركة")
          }
          description={
            reasonAction === "suspend"
              ? c(
                  "Access will be revoked immediately. Existing parcels and financial obligations will be preserved.",
                  "سيُلغى الوصول فورًا مع الاحتفاظ بالطرود والالتزامات المالية الحالية.",
                )
              : c(
                  "Explain what the company administrator needs to correct before resubmitting.",
                  "وضّح ما يجب على مدير الشركة تصحيحه قبل إعادة التقديم.",
                )
          }
          busy={busy}
          open={!!reasonAction}
          onOpenChange={(open) => {
            if (!open && !busy) setReasonAction(null);
          }}
        >
          <form
            key={`${reasonAction}:${details?.company.revision}`}
            onSubmit={(event) => {
              event.preventDefault();
              const reason = String(
                new FormData(event.currentTarget).get("reason") ?? "",
              ).trim();
              if (reason && reasonAction) void transition(reasonAction, reason);
            }}
            className="space-y-4"
          >
            <Label htmlFor="company-reason">{c("Reason", "السبب")}</Label>
            <Input
              id="company-reason"
              name="reason"
              required
              maxLength={500}
              disabled={busy}
            />
            <Button type="submit" disabled={busy}>
              {reasonAction === "reject"
                ? c("Confirm reject", "تأكيد الرفض")
                : c("Confirm suspend", "تأكيد الإيقاف")}
            </Button>
            {error && (
              <p role="alert">
                {c(...(companyErrors[error] ?? companyErrors.unavailable))}
              </p>
            )}
          </form>
        </CompanyDialog>
      </main>
    </div>
  );
}
