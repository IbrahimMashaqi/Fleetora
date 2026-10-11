"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "../password-recovery.action";
import type { ForgotPasswordState } from "../password-recovery.types";
import { PasswordRecoveryShell } from "./password-recovery-shell";

const initialState: ForgotPasswordState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initialState);
  const emailError = state.status === "error" ? state.fieldErrors?.email : undefined;
  const emailValue = state.status === "error" ? state.email : undefined;

  return (
    <PasswordRecoveryShell>
      <section aria-labelledby="forgot-password-title" className="auth-enter w-full max-w-[432px] overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {state.status === "success" ? (
          <div role="status" aria-live="polite" className="auth-success-state space-y-4 p-6 sm:p-8">
            <span className="inline-flex rounded-md bg-success-background px-3 py-1 text-sm font-medium text-success">Request received</span>
            <h1 id="forgot-password-title" className="text-[28px] font-semibold leading-9 tracking-tight">Check your email</h1>
            <p className="text-sm leading-6 text-muted-foreground">If an account matches that email, a reset link is on its way.</p>
            <Link href="/login" className="auth-text-link inline-flex min-h-11 items-center font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">Back to Login</Link>
          </div>
        ) : (
          <div className="p-6 sm:p-8">
            <div className="mb-6">
              <h1 id="forgot-password-title" className="text-[28px] font-semibold leading-9 tracking-tight">Reset your password</h1>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">Enter the email associated with your Fleetora account. We&apos;ll send a reset link if an account matches.</p>
            </div>
            <form action={action} aria-busy={pending} className="space-y-5">
              {state.status === "error" && state.message && <p role="alert" className="auth-feedback rounded-md border border-danger-border bg-danger-background p-3 text-sm text-foreground">{state.message}</p>}
              <fieldset disabled={pending} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="forgot-password-email" className="text-sm font-semibold">Work email</Label>
                  <Input id="forgot-password-email" name="email" type="email" autoComplete="email" required defaultValue={emailValue} placeholder="name@company.com" aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "forgot-password-email-error" : undefined} className="auth-field auth-field-accessible h-12 rounded-lg text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary" />
                  {emailError && <p id="forgot-password-email-error" role="alert" className="text-sm text-danger-foreground">{emailError}</p>}
                </div>
                <Button type="submit" className="auth-action-button auth-primary-action h-12 w-full rounded-lg text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                  {pending ? <><span aria-hidden="true" className="auth-spinner size-4" />Sending link...</> : "Send reset link"}
                </Button>
              </fieldset>
              <p role="status" aria-live="polite" className="sr-only">{pending ? "Sending a password reset link. Please wait." : ""}</p>
            </form>
          </div>
        )}
        {state.status !== "success" && (
          <div className="border-t border-border bg-surface-secondary px-6 py-4 text-center text-[13px] leading-5 text-secondary-foreground">
            Remembered your password? <Link href="/login" className="auth-text-link font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Sign in</Link>
          </div>
        )}
      </section>
    </PasswordRecoveryShell>
  );
}
