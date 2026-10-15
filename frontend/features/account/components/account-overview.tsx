"use client";

import { useProtectedSession } from "@/features/auth/session/session-context";
import { sessionRoleLabels } from "@/lib/auth/session.types";
import { ChangePasswordForm } from "./change-password-form";

export function AccountOverview() {
  const { user } = useProtectedSession();
  const details = [
    { label: "Display name", value: user.name },
    { label: "Email", value: user.email ?? "Email not provided" },
    { label: "Role", value: sessionRoleLabels[user.role] },
    { label: user.company ? "Company" : "Workspace", value: user.company?.name ?? "Platform administration" },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <p className="mb-6 max-w-2xl text-sm leading-6 text-muted-foreground">Review your account and keep your password up to date.</p>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section aria-labelledby="account-details-title" className="min-w-0 rounded-lg border border-border bg-surface p-5 sm:p-6">
          <h2 id="account-details-title" className="text-lg font-semibold tracking-tight">Your account</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {user.company ? "Your account is associated with this company." : "Your account has platform-level context and is not associated with a company."}
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
