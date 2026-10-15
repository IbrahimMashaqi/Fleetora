"use client";

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withSessionLock } from "@/lib/auth/session-lock";
import { changePasswordAction } from "../password-change.action";
import type { PasswordChangeField, PasswordChangeState } from "../password-change.types";

const initialState: PasswordChangeState = { status: "idle" };
const fields: { name: PasswordChangeField; label: string; autoComplete: string }[] = [
  { name: "oldPassword", label: "Current password", autoComplete: "current-password" },
  { name: "newPassword", label: "New password", autoComplete: "new-password" },
  { name: "confirmPassword", label: "Confirm new password", autoComplete: "new-password" },
];

export function ChangePasswordForm({ userId }: { userId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const [state, action, pending] = useActionState(async (previous: PasswordChangeState, data: FormData): Promise<PasswordChangeState> => {
    try {
      return await withSessionLock(() => changePasswordAction(userId, previous, data));
    } catch (error) {
      unstable_rethrow(error);
      return { status: "uncertain", message: "We couldn't confirm whether your password changed. Try signing in with your new password before submitting another change." };
    } finally { submitting.current = false; }
  }, initialState);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  const errors = state.status === "error" ? state.fieldErrors : undefined;
  return (
    <section aria-labelledby="change-password-title" className="min-w-0 rounded-lg border border-border bg-surface p-5 sm:p-6">
      <h2 id="change-password-title" className="text-lg font-semibold tracking-tight">Change password</h2>
      <p id="password-requirements" className="mt-2 text-sm leading-6 text-muted-foreground">
        Use at least 6 characters, including an uppercase letter, and no more than 72 UTF-8 bytes.
      </p>
      <form ref={formRef} action={action} noValidate aria-busy={pending} className="mt-6 space-y-5"
        onSubmit={event => {
          if (submitting.current) event.preventDefault();
          else submitting.current = true;
        }}>
        {state.status !== "idle" && state.status !== "unauthenticated" && state.message && (
          <div role={state.status === "success" ? "status" : "alert"}
            className={`rounded-md border p-3 text-sm leading-6 ${state.status === "success" ? "border-success-border bg-success-background" : "border-danger-border bg-danger-background"}`}>
            {state.message}
          </div>
        )}
        {state.status === "session-changed" && (
          <Button asChild variant="outline"><a href="/app/account">Reload account</a></Button>
        )}
        <fieldset disabled={pending} className="min-w-0 space-y-5">
          <legend className="sr-only">Change your account password</legend>
          {fields.map(field => {
            const error = errors?.[field.name];
            const id = `account-${field.name}`;
            return (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={id}>{field.label}</Label>
                <Input id={id} name={field.name} type="password" autoComplete={field.autoComplete} required
                  aria-invalid={Boolean(error)}
                  aria-describedby={[field.name === "newPassword" ? "password-requirements" : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined} />
                {error && <p id={`${id}-error`} role="alert" className="text-sm text-danger-foreground">{error}</p>}
              </div>
            );
          })}
          <Button type="submit" className="w-full sm:w-auto">{pending ? "Changing password..." : "Change password"}</Button>
        </fieldset>
        {(state.status === "uncertain" || state.status === "error" && !state.fieldErrors) && (
          <Link href="/login" className="inline-flex min-h-10 items-center text-sm font-medium text-accent-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Sign in again</Link>
        )}
        <p role="status" aria-live="polite" className="sr-only">{pending ? "Changing your password. Please wait." : ""}</p>
      </form>
    </section>
  );
}
