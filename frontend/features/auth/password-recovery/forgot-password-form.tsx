"use client";

import Link from "next/link";
import { useActionState } from "react";
import authStyles from "../auth.module.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "./password-recovery.action";
import type { ForgotPasswordState } from "./password-recovery.types";
import { PasswordRecoveryShell } from "./password-recovery-shell";
import { useLocale } from "@/lib/i18n";

const initialState: ForgotPasswordState = { status: "idle" };

export function ForgotPasswordForm() {
  const { t, tMessage } = useLocale();
  const [state, action, pending] = useActionState(forgotPasswordAction, initialState);
  const emailError = state.status === "error" ? state.fieldErrors?.email : undefined;
  const emailValue = state.status === "error" ? state.email : undefined;

  return (
    <PasswordRecoveryShell>
      <section aria-labelledby="forgot-password-title" className={`${authStyles["auth-enter"]} w-full max-w-[432px] overflow-hidden rounded-xl border border-border bg-surface shadow-sm`}>
        {state.status === "success" ? (
          <div role="status" aria-live="polite" className={`${authStyles["auth-success-state"]} space-y-4 p-6 sm:p-8`}>
            <span className="inline-flex rounded-md bg-success-background px-3 py-1 text-sm font-medium text-foreground">{t("Request received")}</span>
            <h1 id="forgot-password-title" className="text-[28px] font-semibold leading-9 tracking-tight">{t("Check your email")}</h1>
            <p className="text-sm leading-6 text-muted-foreground">{t("If an account matches that email, a reset link is on its way.")}</p>
            <Link href="/login" className={`${authStyles["auth-text-link"]} inline-flex min-h-11 items-center font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`}>{t("Back to Login")}</Link>
          </div>
        ) : (
          <div className="p-6 sm:p-8">
            <div className="mb-6">
              <h1 id="forgot-password-title" className="text-[28px] font-semibold leading-9 tracking-tight">{t("Reset your password")}</h1>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">{t("Enter the email associated with your Fleetora account. We'll send a reset link if an account matches.")}</p>
            </div>
            <form action={action} aria-busy={pending} className="space-y-5">
              {state.status === "error" && state.message && <p role="alert" className={`${authStyles["auth-feedback"]} rounded-md border border-danger-border bg-danger-background p-3 text-sm text-foreground`}>{tMessage(state.message)}</p>}
              <fieldset disabled={pending} className={`${authStyles["auth-fields"]} space-y-5`}>
                <div className="space-y-2">
                  <Label htmlFor="forgot-password-email" className="text-sm font-semibold">{t("Work email")}</Label>
                  <Input id="forgot-password-email" name="email" dir="ltr" type="email" autoComplete="email" required defaultValue={emailValue} placeholder="name@company.com" aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "forgot-password-email-error" : undefined} className="h-12 rounded-lg text-sm" />
                  {emailError && <p id="forgot-password-email-error" role="alert" className="text-sm text-danger-foreground">{tMessage(emailError)}</p>}
                </div>
                <Button type="submit" className={`${authStyles["auth-primary-action"]} h-12 w-full rounded-lg text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`}>
                  {pending ? <><span aria-hidden="true" className={`${authStyles["auth-spinner"]} size-4`} />{t("Sending link...")}</> : t("Send reset link")}
                </Button>
              </fieldset>
              <p role="status" aria-live="polite" className="sr-only">{pending ? t("Sending a password reset link. Please wait.") : ""}</p>
            </form>
          </div>
        )}
        {state.status !== "success" && (
          <div className="border-t border-border bg-surface-secondary px-6 py-4 text-center text-[13px] leading-5 text-secondary-foreground">
            {t("Remembered your password?")} <Link href="/login" className={`${authStyles["auth-text-link"]} font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>{t("Sign in")}</Link>
          </div>
        )}
      </section>
    </PasswordRecoveryShell>
  );
}
