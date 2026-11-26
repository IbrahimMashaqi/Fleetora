"use client";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordRecoveryShell } from "@/features/auth/password-recovery/password-recovery-shell";
import { useOneTimeTokenFragment } from "@/features/auth/one-time-token-fragment";
import { newPasswordError } from "@/lib/auth/password-policy";
import { useLocale } from "@/lib/i18n";

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
    "idle" | "pending" | "accepted" | "invalid" | "limited" | "unavailable"
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
      setError(
        c(
          "Use at least 6 characters, including an uppercase letter, and at most 72 UTF-8 bytes.",
          "استخدم 6 أحرف على الأقل منها حرف إنجليزي كبير، وبحد أقصى 72 بايت.",
        ),
      );
      return;
    }
    if (password !== data.get("confirmPassword")) {
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
          response.status === 400
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
  const invalid = state === "invalid" || (fragment.ready && !fragment.token);
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
        ) : invalid ? (
          <p role="alert" className="text-sm leading-6">
            {c(
              "This invitation is invalid, expired or already used. Ask your company administrator for a new invitation.",
              "هذه الدعوة غير صالحة أو منتهية أو مستخدمة. اطلب دعوة جديدة من مسؤول شركتك.",
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
            <form className="space-y-4" onSubmit={submit}>
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
              <p
                id="driver-password-help"
                className="text-xs text-muted-foreground"
              >
                {c(
                  "Use at least 6 characters, including an uppercase letter.",
                  "استخدم 6 أحرف على الأقل منها حرف إنجليزي كبير.",
                )}
              </p>
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
              {(state === "limited" || state === "unavailable") && (
                <p role="alert" className="text-sm text-danger-foreground">
                  {state === "limited"
                    ? c(
                        "Too many attempts. Wait a few minutes and try again.",
                        "محاولات كثيرة. انتظر بضع دقائق ثم حاول مجددًا.",
                      )
                    : c(
                        "Activation could not be confirmed. Try again or ask your company administrator for help.",
                        "تعذر تأكيد التفعيل. حاول مجددًا أو اطلب المساعدة من مسؤول الشركة.",
                      )}
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
