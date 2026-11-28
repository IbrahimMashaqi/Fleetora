"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordRecoveryShell } from "@/features/auth/password-recovery/password-recovery-shell";
import { useLocale } from "@/lib/i18n";

const words = {
  en: {
    title: "Activate Fleetora Merchant",
    help: "Install the Fleetora Merchant app, then open it with the button below. If it doesn't open, copy the activation code and paste it under Activate account in the app.",
    opening: "Preparing your invitation…",
    invalid: "Ask your company for a new invitation link.",
    open: "Open Fleetora app",
    code: "Activation code",
    copy: "Copy activation code",
    show: "Show code",
    hide: "Hide code",
    installHint:
      "Don't have the app yet? Install Fleetora Merchant on your phone, then open this link again.",
    invalidHint:
      "Don't have the app yet? Install Fleetora Merchant on your phone, then ask your company for a new invitation.",
    copied: "Code copied.",
    failed: "Select the code and copy it manually.",
  },
  ar: {
    title: "تفعيل تطبيق Fleetora Merchant",
    help: "ثبّت تطبيق Fleetora Merchant ثم افتحه بالزر أدناه. إذا لم يفتح، انسخ رمز التفعيل والصقه في خيار تفعيل الحساب داخل التطبيق.",
    opening: "جارٍ تجهيز الدعوة…",
    invalid: "اطلب رابط دعوة جديداً من شركتك.",
    open: "فتح تطبيق Fleetora",
    code: "رمز التفعيل",
    copy: "نسخ رمز التفعيل",
    show: "إظهار الرمز",
    hide: "إخفاء الرمز",
    installHint:
      "ليس لديك التطبيق؟ ثبّت تطبيق Fleetora Merchant على هاتفك ثم افتح هذا الرابط مجدداً.",
    invalidHint:
      "ليس لديك التطبيق؟ ثبّت تطبيق Fleetora Merchant على هاتفك ثم اطلب دعوة جديدة من شركتك.",
    copied: "تم نسخ الرمز.",
    failed: "حدد الرمز وانسخه يدوياً.",
  },
};

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

function fragmentToken() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const entries = [...params.entries()];
  const token = params.get("token");
  return entries.length === 1 && token && /^[a-f0-9]{64}$/i.test(token)
    ? token
    : "";
}

export function MerchantActivationPage() {
  const { locale } = useLocale();
  const copy = words[locale];
  const token = useSyncExternalStore<string | null>(
    subscribe,
    fragmentToken,
    () => null,
  );
  const [feedback, setFeedback] = useState<"copied" | "failed">();
  const [showCode, setShowCode] = useState(false);
  const codeId = useId();
  const hintId = useId();
  // The app's activation intent accepts this path; without a token it opens normally.
  const appHome = "fleetora-merchant://app/activate";
  const appLink = token
    ? `fleetora-merchant://app/activate?token=${token}`
    : "";

  async function copyCode() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setFeedback("copied");
    } catch {
      setFeedback("failed");
    }
  }

  return (
    <PasswordRecoveryShell>
      <section
        aria-labelledby="merchant-activation-title"
        className="w-full max-w-md space-y-5 rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8"
      >
        <h1 id="merchant-activation-title" className="text-2xl font-semibold">
          {copy.title}
        </h1>
        {token === null ? (
          <p role="status">{copy.opening}</p>
        ) : !token ? (
          <div className="space-y-4">
            <p
              role="alert"
              className="rounded-md border border-danger-border bg-danger-background p-3 text-sm text-foreground"
            >
              {copy.invalid}
            </p>
            {/* Opens the app on its start screen; it only launches on tap. */}
            <Button asChild variant="outline">
              <a href={appHome} rel="noreferrer">
                {copy.open}
              </a>
            </Button>
            <p className="text-sm leading-6 text-muted-foreground">
              {copy.invalidHint}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm leading-6 text-muted-foreground">
              {copy.help}
            </p>
            {/* Opening the app needs an explicit user gesture; nothing launches on page load. */}
            <Button asChild className="w-full">
              <a href={appLink} rel="noreferrer" aria-describedby={hintId}>
                {copy.open}
              </a>
            </Button>
            <p id={hintId} className="text-sm leading-6 text-muted-foreground">
              {copy.installHint}
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void copyCode()}
            >
              {copy.copy}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              aria-expanded={showCode}
              aria-controls={codeId}
              onClick={() => setShowCode((value) => !value)}
            >
              {showCode ? copy.hide : copy.show}
            </Button>
            <div id={codeId} hidden={!showCode} className="space-y-2">
              <Label htmlFor="merchant-activation-code">{copy.code}</Label>
              <Input
                id="merchant-activation-code"
                value={showCode ? token : ""}
                readOnly
                dir="ltr"
                onFocus={(event) => event.target.select()}
              />
            </div>
            {feedback && (
              <p role="status" className="text-sm">
                {copy[feedback]}
              </p>
            )}
          </>
        )}
      </section>
    </PasswordRecoveryShell>
  );
}
