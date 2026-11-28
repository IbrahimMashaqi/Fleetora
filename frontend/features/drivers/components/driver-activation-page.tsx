"use client";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordRecoveryShell } from "@/features/auth/password-recovery/password-recovery-shell";
import { useOneTimeTokenFragment } from "@/features/auth/one-time-token-fragment";
import { newPasswordError } from "@/lib/auth/password-policy";
import { useLocale } from "@/lib/i18n";
import {
  isDriverActivationFailure,
  type DriverActivationFailure,
} from "../driver-activation-contract";

export function DriverActivationPage() {
  const fragment = useOneTimeTokenFragment("driver-invitation", false);
  return <DriverActivationForm key={fragment.token} fragment={fragment} />;
}

function DriverActivationForm({
  fragment,
}: {
  fragment: ReturnType<typeof useOneTimeTokenFragment>;
}) {
  const { locale } = useLocale();
  const c = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const [state, setState] = useState<
    "idle" | "pending" | "accepted" | DriverActivationFailure
  >("idle");
  const [error, setError] = useState("");
  const locked = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || !fragment.token) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    if (newPasswordError(password)) {
      setError("");
      setState("password-rules");
      return;
    }
    if (password !== data.get("confirmPassword")) {
      setState("idle");
      setError(c("Passwords do not match.", "كلمتا المرور غير متطابقتين."));
      return;
    }
    locked.current = true;
    setState("pending");
    setError("");
    try {
      const response = await fetch("/api/driver/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: fragment.token, password }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      const body: unknown = await response.json();
      if (
        response.ok &&
        typeof body === "object" &&
        body !== null &&
        "status" in body &&
        body.status === "accepted"
      ) {
        form.reset();
        setState("accepted");
      } else
        setState(
          typeof body === "object" &&
            body !== null &&
            "status" in body &&
            isDriverActivationFailure(body.status)
            ? body.status
            : response.status === 400
              ? "invalid"
              : response.status === 429
                ? "limited"
                : "unavailable",
        );
    } catch {
      setState("unavailable");
    } finally {
      locked.current = false;
    }
  }
  function failureMessage(failure: DriverActivationFailure) {
    switch (failure) {
      case "expired":
        return c(
          "This activation link has expired. Ask your company administrator for a new invitation.",
          "انتهت صلاحية رابط التفعيل. اطلب دعوة جديدة من مسؤول الشركة.",
        );
      case "used-or-revoked":
        return c(
          "This activation link was already used or revoked. Ask your company administrator for a new invitation.",
          "استُخدم رابط التفعيل أو أُلغي. اطلب دعوة جديدة من مسؤول الشركة.",
        );
      case "password-rules":
        return c(
          "Password rules were not met. Follow all password requirements.",
          "كلمة المرور لا تستوفي الشروط. التزم بجميع شروط كلمة المرور.",
        );
      case "limited":
        return c(
          "Too many activation attempts. Wait a few minutes and try again.",
          "محاولات تفعيل كثيرة. انتظر بضع دقائق ثم حاول مجددًا.",
        );
      case "phone-in-use":
        return c(
          "This phone is already linked to another driver account. Contact your company administrator.",
          "هذا الرقم مرتبط بحساب سائق آخر. تواصل مع مسؤول الشركة.",
        );
      case "request-rejected":
        return c(
          "This activation request could not be verified. Reopen the activation link.",
          "تعذر التحقق من طلب التفعيل. افتح رابط التفعيل من جديد.",
        );
      case "unavailable":
        return c(
          "Activation service is unavailable. Try again later or contact your company administrator.",
          "خدمة التفعيل غير متاحة. حاول لاحقًا أو تواصل مع مسؤول الشركة.",
        );
      case "invalid":
        return c(
          "This invitation is invalid or no longer available. Ask your company administrator for a new invitation.",
          "هذه الدعوة غير صالحة أو لم تعد متاحة. اطلب دعوة جديدة من مسؤول الشركة.",
        );
    }
  }
  const terminal =
    state === "invalid" ||
    state === "expired" ||
    state === "used-or-revoked" ||
    state === "phone-in-use";
  return (
    <PasswordRecoveryShell>
      <section
        className="w-full max-w-md space-y-5 rounded-lg border border-border bg-surface p-6 sm:p-8"
        aria-labelledby="driver-activation-title"
      >
        <h1 id="driver-activation-title" className="text-2xl font-semibold">
          {state === "accepted"
            ? c("Your driver account is ready", "حساب السائق جاهز")
            : c("Activate your driver account", "تفعيل حساب السائق")}
        </h1>
        {state === "accepted" ? (
          <p role="status" className="text-sm leading-6">
            {c(
              "Use your phone number and the password you chose for driver sign in. Contact your company administrator if you need help.",
              "استخدم رقم هاتفك وكلمة المرور التي اخترتها لتسجيل دخول السائق. تواصل مع مسؤول شركتك إذا احتجت مساعدة.",
            )}
          </p>
        ) : !fragment.ready ? (
          <p role="status">
            {c("Preparing your invitation…", "تجهيز الدعوة…")}
          </p>
        ) : terminal || !fragment.token ? (
          <p role="alert" className="text-sm leading-6">
            {failureMessage(
              isDriverActivationFailure(state) ? state : "invalid",
            )}
          </p>
        ) : (
          <>
            <p className="text-sm leading-6 text-muted-foreground">
              {c(
                "Choose a password for the driver account your company invited. For a forgotten password, ask your company administrator to reissue an invitation.",
                "اختر كلمة مرور لحساب السائق الذي دعتك إليه شركتك. عند نسيان كلمة المرور اطلب من مسؤول الشركة إعادة إصدار الدعوة.",
              )}
            </p>
            <form className="space-y-4" onSubmit={submit} noValidate>
              <div className="space-y-2">
                <Label htmlFor="driver-password">
                  {c("Password", "كلمة المرور")}
                </Label>
                <Input
                  id="driver-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  maxLength={72}
                  required
                  disabled={state === "pending"}
                  aria-describedby="driver-password-help"
                />
              </div>
              <ul
                id="driver-password-help"
                aria-label={c("Password requirements", "شروط كلمة المرور")}
                className="list-disc space-y-1 ps-5 text-xs text-muted-foreground"
              >
                <li>{c("At least 6 characters.", "6 أحرف على الأقل.")}</li>
                <li>
                  {c(
                    "At least one uppercase English letter (A–Z).",
                    "حرف إنجليزي كبير واحد على الأقل (A–Z).",
                  )}
                </li>
              </ul>
              <div className="space-y-2">
                <Label htmlFor="driver-confirm-password">
                  {c("Confirm password", "تأكيد كلمة المرور")}
                </Label>
                <Input
                  id="driver-confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  maxLength={72}
                  required
                  disabled={state === "pending"}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-danger-foreground">
                  {error}
                </p>
              )}
              {isDriverActivationFailure(state) && (
                <p role="alert" className="text-sm text-danger-foreground">
                  {failureMessage(state)}
                </p>
              )}
              <Button
                className="w-full"
                type="submit"
                disabled={state === "pending"}
              >
                {state === "pending"
                  ? c("Activating…", "جارٍ التفعيل…")
                  : c("Activate driver account", "تفعيل حساب السائق")}
              </Button>
            </form>
          </>
        )}
      </section>
    </PasswordRecoveryShell>
  );
}
