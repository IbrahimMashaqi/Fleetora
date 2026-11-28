"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useProtectedSession } from "@/features/auth/session/session-context";
import { notifySessionChange } from "@/features/auth/session/session-events";
import { LogoutControl } from "@/features/auth/logout/logout-control";
import { LanguageSwitcher, useLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { record } from "@/features/platform/platform-contract";
import { isCompany, type Company } from "./company-contract";
import { useCompanyRequest } from "./company-client";
import { basicCompanyInput, CompanyFields } from "./company-fields";
import { companyErrors } from "./company-copy";
export function CompanyProfile({
  statusOnly = false,
}: {
  statusOnly?: boolean;
}) {
  const { user } = useProtectedSession();
  return (
    <Profile
      key={`${user.id}:${user.orgId}:${user.role}`}
      statusOnly={statusOnly}
    />
  );
}
function Profile({ statusOnly }: { statusOnly: boolean }) {
  const { user } = useProtectedSession(),
    { locale } = useLocale(),
    c = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const request = useCompanyRequest(),
    [company, setCompany] = useState<Company | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true;
    request({ action: statusOnly ? "status" : "profile" }).then((result) => {
      if (!current) return;
      if (
        result.status === "ready" &&
        record(result.data) &&
        isCompany(result.data.company)
      ) {
        setCompany(result.data.company);
        setError("");
      } else {
        setCompany(null);
        setError(String(result.status));
      }
    });
    return () => {
      current = false;
    };
  }, [request, statusOnly, refresh]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!company || busy) return;
    setBusy(true);
    setSaved(false);
    setError("");
    const result = await request({
      action: statusOnly ? "resubmit" : "save",
      ...basicCompanyInput(event.currentTarget),
      revision: company.revision,
    });
    setBusy(false);
    if (
      result.status === "ready" &&
      record(result.data) &&
      isCompany(result.data.company)
    ) {
      setCompany(result.data.company);
      setSaved(true);
    } else setError(String(result.status));
  }
  const title = statusOnly
    ? company?.approvalStatus === "REJECTED"
      ? c("Your company registration was rejected", "رُفض تسجيل شركتك")
      : c("Your company is awaiting approval", "شركتك بانتظار الموافقة")
    : c("Company settings", "إعدادات الشركة");
  return (
    <main
      className={
        statusOnly
          ? "mx-auto max-w-xl space-y-6 p-6 sm:p-8"
          : "max-w-2xl space-y-6"
      }
    >
      {statusOnly && (
        <div className="flex items-center justify-between gap-4">
          <span className="font-semibold">Fleetora</span>
          <LanguageSwitcher />
          <LogoutControl />
        </div>
      )}
      <h1 className="text-2xl font-semibold">{title}</h1>
      {error && (
        <p role="alert">
          {c(...(companyErrors[error] ?? companyErrors.unavailable))}
        </p>
      )}
      {!company && !error && (
        <p role="status">{c("Loading…", "جارٍ التحميل…")}</p>
      )}
      {company?.rejectionReason && (
        <p role="alert">{company.rejectionReason}</p>
      )}
      {company && statusOnly && company.approvalStatus === "PENDING" && (
        <p>
          {c(
            "Your company cannot operate until the platform approves registration.",
            "لا يمكن لشركتك العمل حتى توافق المنصة على التسجيل.",
          )}
        </p>
      )}
      {company &&
        (!statusOnly || company.approvalStatus === "REJECTED") &&
        user.role === "COMPANY_ADMIN" && (
          <form
            key={company.id + company.revision}
            onSubmit={save}
            className="space-y-4 rounded-xl border border-border bg-surface p-5"
          >
            <fieldset disabled={busy} className="space-y-4">
              <CompanyFields company={company} />
              {!statusOnly && (
                <p>
                  {c("Currency", "العملة")}: {company.currency} ·{" "}
                  {c("Plan", "الخطة")}: {company.plan}
                  <br />
                  {c(
                    "Activation, plan and currency are controlled by the platform.",
                    "التفعيل والخطة والعملة تتحكم بها المنصة.",
                  )}
                </p>
              )}
              <Button type="submit">
                {busy
                  ? c("Saving…", "جارٍ الحفظ…")
                  : statusOnly
                    ? c("Save and resubmit", "تعديل وإعادة تقديم")
                    : c("Save company profile", "حفظ بيانات الشركة")}
              </Button>
            </fieldset>
          </form>
        )}
      {!statusOnly && user.role !== "COMPANY_ADMIN" && (
        <p role="alert">{c(...companyErrors.forbidden)}</p>
      )}
      {saved && (
        <p role="status">
          {c("Company profile saved.", "تم حفظ بيانات الشركة.")}
        </p>
      )}
      {statusOnly && (
        <Button
          variant="outline"
          onClick={() => {
            setRefresh((v) => v + 1);
            notifySessionChange();
          }}
        >
          {c("Check status", "تحديث الحالة")}
        </Button>
      )}
    </main>
  );
}
