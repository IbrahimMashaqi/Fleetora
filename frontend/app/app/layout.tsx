"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SessionGate } from "@/features/auth/session/session-gate";
import { LogoutControl } from "@/features/auth/logout/logout-control";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      {(user) => (
        <AppShell user={user} accountActions={<LogoutControl className="mt-3" />}>
          {children}
        </AppShell>
      )}
    </SessionGate>
  );
}
