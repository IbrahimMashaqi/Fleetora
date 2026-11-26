"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordRecoveryShell } from "@/features/auth/password-recovery/password-recovery-shell";
import { useLocale } from "@/lib/i18n";

const words = {
  en: {
    title: "Activate Fleetora Merchant",
    help: "Install or open the Fleetora Merchant app. If it did not open automatically, choose Activate account in the app and paste this code to review your invitation.",
    opening: "Preparing your invitation…",
    invalid: "Ask your company for a new invitation link.",
    open: "Open Merchant app",
    code: "Activation code",
    copy: "Copy code",
    copied: "Code copied.",
    failed: "Select the code and copy it manually.",
  },
  ar: {
    title: "تفعيل تطبيق Fleetora Merchant",
    help: "ثبّت أو افتح تطبيق Fleetora Merchant. إذا لم يفتح تلقائياً، اختر تفعيل الحساب في التطبيق والصق هذا الرمز لمراجعة دعوتك.",
    opening: "جارٍ تجهيز الدعوة…",
    invalid: "اطلب رابط دعوة جديداً من شركتك.",
    open: "فتح تطبيق التاجر",
    code: "رمز التفعيل",
    copy: "نسخ الرمز",
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
          <p role="alert">{copy.invalid}</p>
        ) : (
          <>
            <p className="text-sm leading-6 text-muted-foreground">
              {copy.help}
            </p>
            {/* The OS may require a user gesture; the link and code remain usable. */}
            <iframe
              hidden
              title="Fleetora Merchant"
              src={appLink}
              referrerPolicy="no-referrer"
            />
            <Button asChild className="w-full">
              <a href={appLink} rel="noreferrer">
                {copy.open}
              </a>
            </Button>
            <div className="space-y-2">
              <Label htmlFor="merchant-activation-code">{copy.code}</Label>
              <Input
                id="merchant-activation-code"
                value={token}
                readOnly
                dir="ltr"
                onFocus={(event) => event.target.select()}
              />
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void copyCode()}
            >
              {copy.copy}
            </Button>
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
