"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Schibsted_Grotesk } from "next/font/google";

const schibsted = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });

export function PasswordRecoveryShell({ children }: { children: ReactNode }) {
  return (
    <main className={`${schibsted.className} min-h-svh bg-background text-foreground`}>
      <header className="flex h-16 shrink-0 items-center border-b border-border/70 bg-background px-4 sm:px-8 min-[1440px]:px-16">
        <Link href="/login" aria-label="Fleetora sign in" className="flex items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Image src="/fleetora-logo.png" alt="" aria-hidden="true" width={40} height={40} className="size-10 shrink-0 object-contain" />
          <span>
            <span className="block text-lg font-semibold leading-6 tracking-tight">Fleetora</span>
            <span className="mt-0.5 block text-xs leading-4 text-secondary-foreground">Logistics operations</span>
          </span>
        </Link>
      </header>
      <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-4 py-8 sm:px-8 sm:py-12">
        {children}
      </div>
    </main>
  );
}
