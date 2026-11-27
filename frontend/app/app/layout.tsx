"use client";

import type { ReactNode } from "react";
import { CompanyProfile } from "@/features/companies/company-profile";
import { AppShell } from "@/components/layout/app-shell";
import { SessionGate } from "@/features/auth/session/session-gate";
import { LogoutControl } from "@/features/auth/logout/logout-control";
import { PlatformRedirect } from "@/features/platform/platform-redirect";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      {(user) => user.role === 'PLATFORM_ADMIN' ? <PlatformRedirect /> : ['PENDING','REJECTED'].includes(user.company?.approvalStatus ?? '') ? <CompanyProfile key={user.id} statusOnly/> : (
        <AppShell user={user} accountActions={<LogoutControl className="mt-3" />}>
          {children}
        </AppShell>
      )}
    </SessionGate>
  );
}
