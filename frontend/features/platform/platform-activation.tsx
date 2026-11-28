"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { PasswordRecoveryShell } from "@/features/auth/password-recovery/password-recovery-shell";
import { useOneTimeTokenFragment } from "@/features/auth/one-time-token-fragment";
import { newPasswordError } from "@/lib/auth/password-policy";
import { useLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { record } from "./platform-contract";
export function PlatformActivation({
  kind = "platform",
}: {
  kind?: "platform" | "company";
}) {
  const fragment = useOneTimeTokenFragment(`${kind}-invitation`, false);
  return (
    <Activation
      key={fragment.token}
      kind={kind}
      token={fragment.token}
      ready={fragment.ready}
    />
  );
}
function Activation({
  token,
  ready,
  kind,
}: {
  token: string;
  ready: boolean;
  kind: "platform" | "company";
}) {
  const { locale } = useLocale(),
    c = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const [state, setState] = useState("idle"),
    [mismatch, setMismatch] = useState(false);
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !token) return;
    const form = event.currentTarget,
      input = new FormData(form),
      password = String(input.get("password") ?? "");
    setMismatch(false);
    if (newPasswordError(password)) {
      setState("password-rules");
      return;
    }
    if (password !== input.get("confirmPassword")) {
      setMismatch(true);
      return;
    }
    lock.current = true;
    setState("pending");
    try {
      const response = await fetch(`/api/${kind}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: input.get("name"), password }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      const body: unknown = await response.json();
      setState(
        record(body) && typeof body.status === "string"
          ? body.status
          : "unavailable",
      );
      if (response.ok && record(body) && body.status === "accepted")
        form.reset();
    } catch {
      setState("unavailable");
    } finally {
      lock.current = false;
    }
  }
  const messages: Record<string, [string, string]> = {
    invalid: [
      "This activation link is invalid, already used or revoked. Ask a Super Admin for a new invitation.",
      "رابط التفعيل غير صالح أو مستخدم أو ملغى. اطلب دعوة جديدة من المسؤول الأعلى.",
    ],
    expired: [
      "This activation link has expired. Ask a Super Admin for a new invitation.",
      "انتهت صلاحية رابط التفعيل. اطلب دعوة جديدة من المسؤول الأعلى.",
    ],
    limited: [
      "Too many attempts. Wait a few minutes and try again.",
      "محاولات كثيرة. انتظر بضع دقائق ثم حاول مجدداً.",
    ],
    "password-rules": [
      "Use at least 6 characters, including an uppercase English letter (A–Z).",
      "استخدم 6 أحرف على الأقل، منها حرف إنجليزي كبير (A–Z).",
    ],
    unavailable: [
      "We could not confirm activation. Try again or ask a Super Admin for help.",
      "تعذّر تأكيد التفعيل. حاول مجدداً أو اطلب مساعدة المسؤول الأعلى.",
    ],
  };
  if (kind === "company") {
    messages.invalid = [
      "This activation link is invalid, already used or revoked. Ask the platform team for a new invitation.",
      "رابط التفعيل غير صالح أو مستخدم أو ملغى. اطلب دعوة جديدة من فريق المنصة.",
    ];
    messages.expired = [
      "This activation link has expired. Ask the platform team for a new invitation.",
      "انتهت صلاحية رابط التفعيل. اطلب دعوة جديدة من فريق المنصة.",
    ];
    messages.unavailable = [
      "We could not confirm activation. Try again or ask the platform team for help.",
      "تعذّر تأكيد التفعيل. حاول مجددًا أو اطلب مساعدة فريق المنصة.",
    ];
  }
  const signInHref = kind === "company" ? "/login" : "/platform/login";
  const linkFailed =
    (ready && !token) || state === "invalid" || state === "expired";
  return (
    <PasswordRecoveryShell>
      <section className="w-full max-w-md rounded-xl border border-border bg-surface p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">
          {kind === "company"
            ? c("Activate company administrator", "تفعيل مدير الشركة")
            : c("Activate platform account", "تفعيل حساب المنصة")}
        </h1>
        {state === "accepted" ? (
          <div className="mt-5 space-y-4">
            <p role="status">
              {c(
                "Your account is ready. Sign in with your email and password.",
                "حسابك جاهز. سجّل الدخول بالبريد وكلمة المرور.",
              )}
            </p>
            <Button asChild>
              <Link href={kind === "company" ? "/login" : "/platform/login"}>
                {kind === "company"
                  ? c("Go to sign in", "الانتقال إلى تسجيل الدخول")
                  : c("Platform sign in", "تسجيل دخول المنصة")}
              </Link>
            </Button>
          </div>
        ) : linkFailed ? (
          <div className="mt-5 space-y-4">
            <p
              role="alert"
              className="rounded-md border border-danger-border bg-danger-background p-3 text-sm text-foreground"
            >
              {c(
                ...(state === "expired" ? messages.expired : messages.invalid),
              )}
            </p>
            <Button asChild variant="outline">
              <Link href={signInHref}>
                {c("Back to sign in", "العودة إلى تسجيل الدخول")}
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <p
              id="platform-password-rules"
              className="my-4 text-sm text-muted-foreground"
            >
              {c(...messages["password-rules"])}
            </p>
            {messages[state] && (
              <p role="alert" className="mb-4 text-sm text-danger-foreground">
                {c(...messages[state])}
              </p>
            )}
            {mismatch && (
              <p role="alert">
                {c("Passwords do not match.", "كلمتا المرور غير متطابقتين.")}
              </p>
            )}
            <form onSubmit={submit} className="space-y-4">
              <fieldset
                disabled={!ready || state === "pending"}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="platform-name">
                    {c("Full name", "الاسم الكامل")}
                  </Label>
                  <Input
                    id="platform-name"
                    name="name"
                    autoComplete="name"
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="platform-password">
                    {c("Password", "كلمة المرور")}
                  </Label>
                  <Input
                    id="platform-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    aria-describedby="platform-password-rules"
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="platform-confirm">
                    {c("Confirm password", "تأكيد كلمة المرور")}
                  </Label>
                  <Input
                    id="platform-confirm"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full">
                  {state === "pending"
                    ? c("Activating…", "جارٍ التفعيل…")
                    : c("Activate account", "تفعيل الحساب")}
                </Button>
              </fieldset>
            </form>
          </>
        )}
      </section>
    </PasswordRecoveryShell>
  );
}
