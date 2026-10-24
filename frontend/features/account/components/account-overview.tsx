"use client";

import { useProtectedSession } from "@/features/auth/session/session-context";
import { useLocale } from "@/lib/i18n";
import { ChangePasswordForm } from "./change-password-form";

export function AccountOverview() {
  const { user } = useProtectedSession();
  const { t } = useLocale();
  const role = user.role === "COMPANY_ADMIN"
    ? t("Company administrator")
    : user.role === "PLATFORM_ADMIN"
      ? t("Platform administrator")
      : user.role === "MERCHANT"
        ? t("Merchant")
        : t("Accountant");
  const details = [
    { label: t("Display name"), value: user.name },
    { label: t("Email"), value: user.email ?? t("Email not provided") },
    { label: t("Role"), value: role },
    { label: user.company ? t("Company") : t("Workspace"), value: user.company?.name ?? t("Platform administration") },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <p className="mb-6 max-w-2xl text-sm leading-6 text-muted-foreground">{t("Review your account and keep your password up to date.")}</p>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section aria-labelledby="account-details-title" className="min-w-0 rounded-lg border border-border bg-surface p-5 sm:p-6">
          <h2 id="account-details-title" className="text-lg font-semibold tracking-tight">{t("Your account")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {user.company ? t("Your account is associated with this company.") : t("Your account has platform-level context and is not associated with a company.")}
          </p>
          <dl className="mt-6 divide-y divide-border">
            {details.map(detail => (
              <div key={detail.label} className="min-w-0 py-4 first:pt-0 last:pb-0">
                <dt className="text-xs font-medium text-muted-foreground">{detail.label}</dt>
                <dd className="mt-1 text-sm font-medium leading-6 [overflow-wrap:anywhere]">{detail.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <ChangePasswordForm userId={user.id} />
      </div>
    </div>
  );
}
