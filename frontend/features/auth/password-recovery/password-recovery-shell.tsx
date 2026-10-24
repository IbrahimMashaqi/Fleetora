"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { LanguageSwitcher, useLocale } from "@/lib/i18n";

export function PasswordRecoveryShell({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background px-4 sm:px-8 min-[1440px]:px-16">
        <Link href="/login" aria-label={t("Fleetora sign in")} className="flex items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Image src="/fleetora-logo.png" alt="" aria-hidden="true" width={40} height={40} className="size-10 shrink-0 object-contain" />
          <span>
            <span className="block text-lg font-semibold leading-6 tracking-tight">Fleetora</span>
            <span className="mt-0.5 block text-xs leading-4 text-secondary-foreground">{t("Logistics operations")}</span>
          </span>
        </Link>
        <LanguageSwitcher />
      </header>
      <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-4 py-8 sm:px-8 sm:py-12">
        {children}
      </div>
    </main>
  );
}
