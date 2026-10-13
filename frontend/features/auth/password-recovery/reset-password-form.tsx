"use client";

import Link from "next/link";
import { useActionState } from "react";
import authStyles from "../auth.module.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "./password-recovery.action";
import type { ResetPasswordState } from "./password-recovery.types";
import { useOneTimeTokenFragment } from "../one-time-token-fragment";
import { PasswordRecoveryShell } from "./password-recovery-shell";

const initialState: ResetPasswordState = { status: "idle" };
const validUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validToken = /^[a-f0-9]{64}$/i;

export function ResetPasswordForm({
  userId,
  legacyTokenInQuery,
}: {
  userId: string;
  legacyTokenInQuery: boolean;
}) {
  const tokenSnapshot = useOneTimeTokenFragment(userId, legacyTokenInQuery);
  const token = tokenSnapshot.token;
  const [state, action, pending] = useActionState(resetPasswordAction.bind(null, userId, token), initialState);
  const validLink = tokenSnapshot.ready && !legacyTokenInQuery && validUserId.test(userId) && validToken.test(token);

  return (
    <PasswordRecoveryShell>
      <section aria-labelledby="reset-password-title" className={`${authStyles["auth-enter"]} w-full max-w-[432px] overflow-hidden rounded-xl border border-border bg-surface shadow-sm`}>
        <div className="p-6 sm:p-8">
          <h1 id="reset-password-title" className="text-[28px] font-semibold leading-9 tracking-tight">Choose a new password</h1>
          <p className="mt-2 mb-6 text-sm leading-5 text-muted-foreground">Use at least 6 characters, including an uppercase letter.</p>
          {!tokenSnapshot.ready ? (
            <p role="status" className="text-sm text-muted-foreground">Preparing the reset form...</p>
          ) : !validLink ? (
            <div className="space-y-4">
              <p role="alert" className={`${authStyles["auth-feedback"]} rounded-md border border-danger-border bg-danger-background p-3 text-sm text-foreground`}>This reset link is invalid or expired. Request a new one to continue.</p>
              <Link href="/forgot-password" className={`${authStyles["auth-text-link"]} inline-flex min-h-11 items-center font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>Request a new link</Link>
            </div>
          ) : (
            <form action={action} aria-busy={pending} className="space-y-5">
              {state.status === "error" && state.message && <p role="alert" className={`${authStyles["auth-feedback"]} rounded-md border border-danger-border bg-danger-background p-3 text-sm text-foreground`}>{state.message}</p>}
              <fieldset disabled={pending} className={`${authStyles["auth-fields"]} space-y-5`}>
                <div className="space-y-2">
                  <Label htmlFor="reset-password" className="text-sm font-semibold">New password</Label>
                  <Input id="reset-password" name="password" type="password" autoComplete="new-password" required minLength={6} aria-invalid={Boolean(state.status === "error" && state.fieldErrors?.password)} aria-describedby={state.status === "error" && state.fieldErrors?.password ? "reset-password-error" : undefined} className="h-12 rounded-lg text-sm" />
                  {state.status === "error" && state.fieldErrors?.password && <p id="reset-password-error" role="alert" className="text-sm text-danger-foreground">{state.fieldErrors.password}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-password-confirm" className="text-sm font-semibold">Confirm new password</Label>
                  <Input id="reset-password-confirm" name="confirmPassword" type="password" autoComplete="new-password" required minLength={6} aria-invalid={Boolean(state.status === "error" && state.fieldErrors?.confirmPassword)} aria-describedby={state.status === "error" && state.fieldErrors?.confirmPassword ? "reset-password-confirm-error" : undefined} className="h-12 rounded-lg text-sm" />
                  {state.status === "error" && state.fieldErrors?.confirmPassword && <p id="reset-password-confirm-error" role="alert" className="text-sm text-danger-foreground">{state.fieldErrors.confirmPassword}</p>}
                </div>
                <Button type="submit" className={`${authStyles["auth-primary-action"]} h-12 w-full rounded-lg text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`}>
                  {pending ? <><span aria-hidden="true" className={`${authStyles["auth-spinner"]} size-4`} />Updating password...</> : "Reset password"}
                </Button>
              </fieldset>
              <p role="status" aria-live="polite" className="sr-only">{pending ? "Updating your password. Please wait." : ""}</p>
            </form>
          )}
        </div>
        <div className="border-t border-border bg-surface-secondary px-6 py-4 text-center text-[13px] leading-5 text-secondary-foreground">
          <Link href="/login" className={`${authStyles["auth-text-link"]} font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>Back to Login</Link>
        </div>
      </section>
    </PasswordRecoveryShell>
  );
}
