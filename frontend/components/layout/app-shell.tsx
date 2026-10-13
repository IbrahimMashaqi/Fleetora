"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { SessionRole, SessionUser } from "@/lib/auth/session.types";

const roleLabels: Record<SessionRole, string> = {
  PLATFORM_ADMIN: "Platform administrator",
  COMPANY_ADMIN: "Company administrator",
  MERCHANT: "Merchant",
  ACCOUNTANT: "Accountant",
};

function FleetoraBrand({ lightSurface = false }: { lightSurface?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={lightSurface ? "grid size-9 shrink-0 place-items-center rounded-md bg-sidebar-navy" : "block size-9 shrink-0"}>
        <Image
          src="/fleetora-logo.png"
          alt=""
          aria-hidden="true"
          width={36}
          height={36}
          className={lightSurface ? "size-7 object-contain" : "size-9 object-contain"}
        />
      </span>
      <span className={`truncate text-base font-semibold tracking-tight ${lightSurface ? "text-foreground" : "text-white"}`}>
        Fleetora
      </span>
    </div>
  );
}

function OverviewNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const isOverview = usePathname() === "/app";
  return (
    <nav aria-label="Primary navigation" className="px-4 py-5">
      <Link
        href="/app"
        aria-current={isOverview ? "page" : undefined}
        onClick={onNavigate}
        className="flex min-h-11 items-center gap-3 rounded-md border-l-2 border-primary bg-brand-navy px-3 text-sm font-medium text-white outline-none transition-colors hover:bg-brand-navy/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar-navy"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5 shrink-0">
          <path d="m3.5 8.25 6.5-5 6.5 5v7a1.25 1.25 0 0 1-1.25 1.25h-10A1.25 1.25 0 0 1 4 15.25v-7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M8 16.5v-5h4v5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <span>Overview</span>
      </Link>
    </nav>
  );
}

function SidebarAccount({ user, accountActions }: { user: SessionUser; accountActions: ReactNode }) {
  return (
    <div className="min-w-0 border-t border-white/10 px-5 py-4">
      <p className="text-xs font-medium text-sidebar-foreground/70">Signed in as</p>
      <p className="mt-1 truncate text-sm font-medium text-white" title={user.name}>{user.name}</p>
      <p className="mt-0.5 truncate text-xs text-sidebar-foreground/70">{roleLabels[user.role]}</p>
      {user.email && (
        <p className="mt-0.5 truncate text-xs text-sidebar-foreground/70" title={user.email}>
          {user.email}
        </p>
      )}
      {accountActions}
    </div>
  );
}

function MobileWorkspaceContext({ user }: { user: SessionUser }) {
  const workspaceName = user.company?.name ?? "Platform administration";

  return (
    <div className="mx-5 mt-4 min-w-0 border-b border-white/10 px-1 pb-4">
      <p className="text-xs leading-4 text-sidebar-foreground/70">
        {user.company ? "Company workspace" : "Workspace"}
      </p>
      <p className="mt-1 break-words text-sm font-medium leading-5 text-white">
        {workspaceName}
      </p>
    </div>
  );
}

function MobileNavigation({ user, accountActions }: { user: SessionUser; accountActions: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="size-10 rounded-md text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5">
          <path d="M3.25 5.25h13.5M3.25 10h13.5M3.25 14.75h13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby="mobile-navigation-title"
        onClose={() => setOpen(false)}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-72 max-w-[84vw] border-0 bg-sidebar-navy p-0 text-sidebar-foreground shadow-lg backdrop:bg-sidebar-navy/55"
      >
        <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
            <h2 id="mobile-navigation-title" className="sr-only">Mobile navigation</h2>
            <FleetoraBrand />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close navigation"
              autoFocus
              onClick={() => setOpen(false)}
              className="size-10 rounded-md text-white hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar-navy"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5">
                <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </Button>
          </div>
          <MobileWorkspaceContext user={user} />
          <OverviewNavigation onNavigate={() => setOpen(false)} />
          <div className="mt-auto">
            <SidebarAccount user={user} accountActions={accountActions} />
          </div>
        </div>
      </dialog>
    </>
  );
}

function DesktopSidebar({ user, accountActions }: { user: SessionUser; accountActions: ReactNode }) {
  return (
    <aside aria-label="Workspace sidebar" className="hidden min-h-svh w-[248px] shrink-0 flex-col bg-sidebar-navy text-sidebar-foreground lg:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-6">
        <FleetoraBrand />
      </div>
      <OverviewNavigation />
      <div className="mt-auto">
        <SidebarAccount user={user} accountActions={accountActions} />
      </div>
    </aside>
  );
}

function WorkspaceContext({ user }: { user: SessionUser }) {
  const companyName = user.company?.name;

  return (
    <div className="ml-auto hidden min-w-0 md:block">
      <div className="min-w-0 max-w-64 text-right">
        <p className="text-xs leading-4 text-muted-foreground">{companyName ? "Company" : "Workspace"}</p>
        <p className="truncate text-sm font-medium leading-5" title={companyName ?? "Platform administration"}>
          {companyName ?? "Platform administration"}
        </p>
      </div>
    </div>
  );
}

export function AppShell({ user, accountActions, children }: { user: SessionUser; accountActions: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-svh w-full bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-surface px-4 py-3 font-medium text-foreground shadow-md outline-none focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus-visible:ring-2 focus-visible:ring-primary"
      >
        Skip to content
      </a>
      <DesktopSidebar user={user} accountActions={accountActions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center border-b border-border bg-surface px-4 sm:px-6 lg:h-16 lg:px-8">
          <div className="mx-auto flex w-full max-w-5xl min-w-0 items-center gap-3">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <FleetoraBrand lightSurface />
              <h1 className="truncate text-sm font-semibold tracking-tight">Overview</h1>
            </div>
            <h1 className="hidden text-base font-semibold tracking-tight lg:block">Overview</h1>
            <WorkspaceContext user={user} />
            <div className="ml-auto lg:hidden">
              <MobileNavigation user={user} accountActions={accountActions} />
            </div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-8 outline-none sm:px-6 sm:py-10 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
