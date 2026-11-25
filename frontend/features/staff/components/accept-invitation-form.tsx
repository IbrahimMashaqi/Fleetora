"use client";

import Link from "next/link";
import { useActionState } from "react";
import authStyles from "@/features/auth/auth.module.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOneTimeTokenFragment } from "@/features/auth/one-time-token-fragment";
import { PasswordRecoveryShell } from "@/features/auth/password-recovery/password-recovery-shell";
import { useLocale } from "@/lib/i18n";
import { acceptStaffInvitationAction } from "../accept-invitation.action";
import type { AcceptInvitationState } from "../staff.types";

const initialState: AcceptInvitationState = { status: "idle" };

const words = {
  en: {
    title: "Join your company on Fleetora",
    intro: "Set your name and a password to activate your invited account.",
    preparing: "Preparing your invitation...",
    invalidLink: "This invitation link is invalid or expired. Ask your company administrator for a new one.",
    name: "Full name",
    nameError: "Enter your full name (2 to 120 characters).",
    password: "Password",
    confirm: "Confirm password",
    passwordHint: "Use at least 6 characters, including an uppercase letter.",
    submit: "Activate account",
    submitting: "Activating...",
    submittingStatus: "Activating your account. Please wait.",
    invalid: "This invitation is invalid, expired, or already used. Ask your company administrator for a new one.",
    conflict: "An account already uses this email. Sign in instead, or ask your administrator for help.",
    limited: "Too many attempts. Wait a few minutes and try again.",
    unavailable: "We couldn't activate your account right now. Please try again.",
    acceptedTitle: "Your account is ready",
    accepted: "Sign in with {email} and the password you just chose.",
    signIn: "Go to sign in",
    back: "Back to Login",
  },
  ar: {
    title: "انضم إلى شركتك على Fleetora",
    intro: "اختر اسمك وكلمة مرور لتفعيل حسابك المدعو.",
    preparing: "جارٍ تجهيز الدعوة...",
    invalidLink: "رابط الدعوة غير صالح أو منتهي. اطلب رابطاً جديداً من مسؤول شركتك.",
    name: "الاسم الكامل",
    nameError: "أدخل اسمك الكامل (من 2 إلى 120 حرفاً).",
    password: "كلمة المرور",
    confirm: "تأكيد كلمة المرور",
    passwordHint: "استخدم 6 أحرف على الأقل، منها حرف إنجليزي كبير.",
    submit: "تفعيل الحساب",
    submitting: "جارٍ التفعيل...",
    submittingStatus: "جارٍ تفعيل حسابك. يرجى الانتظار.",
    invalid: "هذه الدعوة غير صالحة أو منتهية أو مستخدمة. اطلب دعوة جديدة من مسؤول شركتك.",
    conflict: "يوجد حساب بهذا البريد بالفعل. سجّل الدخول بدلاً من ذلك أو تواصل مع المسؤول.",
    limited: "محاولات كثيرة. انتظر بضع دقائق ثم حاول مجدداً.",
    unavailable: "تعذر تفعيل حسابك حالياً. حاول مجدداً.",
    acceptedTitle: "حسابك جاهز",
    accepted: "سجّل الدخول باستخدام {email} وكلمة المرور التي اخترتها.",
    signIn: "الانتقال لتسجيل الدخول",
    back: "العودة لتسجيل الدخول",
  },
};

export function AcceptInvitationForm() {
  const { locale, tMessage } = useLocale();
  const copy = words[locale];
  const snapshot = useOneTimeTokenFragment("staff-invitation", false);
  const [state, action, pending] = useActionState(
    acceptStaffInvitationAction.bind(null, snapshot.token),
    initialState,
  );
  const fieldError = (field: "name" | "password" | "confirmPassword") =>
    state.status === "error" ? state.fieldErrors?.[field] : undefined;
  const field = (
    name: "name" | "password" | "confirmPassword",
    label: string,
    props: { type: string; autoComplete: string; dir?: "ltr" },
  ) => {
    const error = fieldError(name);
    return (
      <div className="space-y-2">
        <Label htmlFor={`invite-${name}`} className="text-sm font-semibold">{label}</Label>
        <Input
          id={`invite-${name}`}
          name={name}
          required
          minLength={name === "name" ? 2 : 6}
          maxLength={name === "name" ? 120 : undefined}
          defaultValue={name === "name" && state.status === "error" ? state.name : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `invite-${name}-error` : undefined}
          className="h-12 rounded-lg text-sm"
          {...props}
        />
        {error && (
          <p id={`invite-${name}-error`} role="alert" className="text-sm text-danger-foreground">
            {name === "name" ? copy.nameError : tMessage(error)}
          </p>
        )}
      </div>
    );
  };

  return (
    <PasswordRecoveryShell>
      <section
        aria-labelledby="accept-invitation-title"
        className={`${authStyles["auth-enter"]} w-full max-w-[432px] overflow-hidden rounded-xl border border-border bg-surface shadow-sm`}
      >
        <div className="p-6 sm:p-8">
          <h1 id="accept-invitation-title" className="text-[28px] font-semibold leading-9 tracking-tight">
            {state.status === "accepted" ? copy.acceptedTitle : copy.title}
          </h1>
          {state.status === "accepted" ? (
            <div className="mt-4 space-y-5">
              <p role="status" className="text-sm leading-6">
                {copy.accepted.split("{email}")[0]}
                <bdi dir="ltr" className="font-semibold">{state.email}</bdi>
                {copy.accepted.split("{email}")[1]}
              </p>
              <Button asChild className="h-12 w-full rounded-lg text-sm font-semibold">
                <Link href="/login">{copy.signIn}</Link>
              </Button>
            </div>
          ) : (
            <>
              <p className="mt-2 mb-6 text-sm leading-5 text-muted-foreground">{copy.intro}</p>
              {!snapshot.ready ? (
                <p role="status" className="text-sm text-muted-foreground">{copy.preparing}</p>
              ) : !snapshot.token ? (
                <p role="alert" className={`${authStyles["auth-feedback"]} rounded-md border border-danger-border bg-danger-background p-3 text-sm text-foreground`}>
                  {copy.invalidLink}
                </p>
              ) : (
                <form action={action} aria-busy={pending} className="space-y-5">
                  {state.status === "error" && state.message && (
                    <p role="alert" className={`${authStyles["auth-feedback"]} rounded-md border border-danger-border bg-danger-background p-3 text-sm text-foreground`}>
                      {copy[state.message]}
                    </p>
                  )}
                  <fieldset disabled={pending} className={`${authStyles["auth-fields"]} space-y-5`}>
                    {field("name", copy.name, { type: "text", autoComplete: "name" })}
                    {field("password", copy.password, { type: "password", autoComplete: "new-password", dir: "ltr" })}
                    <p className="-mt-3 text-xs text-muted-foreground">{copy.passwordHint}</p>
                    {field("confirmPassword", copy.confirm, { type: "password", autoComplete: "new-password", dir: "ltr" })}
                    <Button
                      type="submit"
                      className={`${authStyles["auth-primary-action"]} h-12 w-full rounded-lg text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`}
                    >
                      {pending ? (
                        <>
                          <span aria-hidden="true" className={`${authStyles["auth-spinner"]} size-4`} />
                          {copy.submitting}
                        </>
                      ) : (
                        copy.submit
                      )}
                    </Button>
                  </fieldset>
                  <p role="status" aria-live="polite" className="sr-only">
                    {pending ? copy.submittingStatus : ""}
                  </p>
                </form>
              )}
            </>
          )}
        </div>
        <div className="border-t border-border bg-surface-secondary px-6 py-4 text-center text-[13px] leading-5 text-secondary-foreground">
          <Link href="/login" className={`${authStyles["auth-text-link"]} font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>
            {copy.back}
          </Link>
        </div>
      </section>
    </PasswordRecoveryShell>
  );
}
