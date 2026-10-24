"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher, useLocale } from "@/lib/i18n";
import type { SessionUser } from "@/lib/auth/session.types";
import styles from "./app-shell.module.css";

const navigation = [
  { href: "/app", label: "Overview" as const },
  { href: "/app/live-map", label: "Live Tracking" as const },
  { href: "/app/operations", label: "Parcel operations" as const },
  { href: "/app/parcels", label: "Parcels" as const },
  { href: "/app/pickups", label: "Pickup requests" as const },
  { href: "/app/requests", label: "Merchant requests" as const },
  { href: "/app/pricing", label: "Delivery pricing" as const },
  { href: "/app/merchants", label: "Merchants" as const },
  { href: "/app/drivers", label: "Drivers" as const },
  { href: "/app/vehicles", label: "Vehicles" as const },
  { href: "/app/returns", label: "Returns" as const },
  { href: "/app/collections", label: "COD & collections" as const },
  { href: "/app/settlements", label: "Merchant settlements" as const },
  { href: "/app/account", label: "Account & security" as const },
];

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
      <span className={`${lightSurface ? "hidden sm:block" : ""} truncate text-base font-semibold tracking-tight ${lightSurface ? "text-foreground" : "text-white"}`}>
        Fleetora
      </span>
    </div>
  );
}

function WorkspaceNavigation({ user, onNavigate }: { user: SessionUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useLocale();
  return (
    <nav aria-label={t("Primary navigation")} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
      {navigation.filter(item => ["/app", "/app/account"].includes(item.href) || user.company !== null && (user.role === "COMPANY_ADMIN" || user.role === "ACCOUNTANT" && ["/app/operations", "/app/parcels", "/app/merchants", "/app/returns", "/app/collections", "/app/settlements", "/app/requests"].includes(item.href))).map(item => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={(pathname === item.href || item.href !== "/app" && pathname.startsWith(`${item.href}/`)) ? "page" : undefined}
          onClick={onNavigate}
          className={`${styles.sidebarItem} ${item.href === "/app/account" ? "mt-3" : ""} ${(pathname === item.href || item.href !== "/app" && pathname.startsWith(`${item.href}/`)) ? styles.active : ""}`}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5 shrink-0">
            {item.href === "/app" ? (
              <>
                <path d="m3.5 8.25 6.5-5 6.5 5v7a1.25 1.25 0 0 1-1.25 1.25h-10A1.25 1.25 0 0 1 4 15.25v-7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M8 16.5v-5h4v5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </>
            ) : item.href === "/app/live-map" ? (
              <><path d="M16 8c0 4-6 9-6 9S4 12 4 8a6 6 0 1 1 12 0Z" stroke="currentColor" strokeWidth="1.5" /><circle cx="10" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" /></>
            ) : ["/app/operations", "/app/parcels", "/app/returns", "/app/collections", "/app/settlements"].includes(item.href) ? (
              <><path d="m3 6 7-3 7 3v9l-7 3-7-3V6Zm0 0 7 3 7-3M10 9v9M6 4.5l7 3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></>
            ) : item.href === "/app/account" ? (
              <>
                <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4 17v-1.5a6 6 0 0 1 12 0V17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </>
            ) : item.href === "/app/drivers" ? (
              <>
                <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 10h5m4 0h5m-7 2v5" stroke="currentColor" strokeWidth="1.5" />
              </>
            ) : item.href === "/app/vehicles" ? (
              <>
                <path d="m3 8 2-4h10l2 4v7h-3v-3H6v3H3V8Zm0 0h14M6 10h1m6 0h1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </>
            ) : (
              <>
                <path d="M3 8h14l-1-4H4L3 8Zm1 0v8h12V8M8 16v-5h4v5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </>
            )}
          </svg>
          <span>{t(item.label)}</span>
        </Link>
      ))}
    </nav>
  );
}

function SidebarAccount({ user, accountActions }: { user: SessionUser; accountActions: ReactNode }) {
  const { t } = useLocale();
  const roleLabel = user.role === "COMPANY_ADMIN"
    ? t("Company administrator")
    : user.role === "PLATFORM_ADMIN"
      ? t("Platform administrator")
      : user.role === "MERCHANT"
        ? t("Merchant")
        : t("Accountant");
  return (
    <div className="min-w-0 shrink-0 border-t border-white/10 px-4 pt-4 pb-6">
      <div className="px-3">
        <p className="truncate text-sm font-medium text-white" title={user.name}>{user.name}</p>
        <p className="mt-1 truncate text-xs text-sidebar-foreground/80">{roleLabel}</p>
      </div>
      {accountActions}
    </div>
  );
}

function MobileWorkspaceContext({ user }: { user: SessionUser }) {
  const { t } = useLocale();
  const workspaceName = user.company?.name ?? t("Platform administration");

  return (
    <div className="mx-5 mt-4 min-w-0 border-b border-white/10 px-1 pb-4">
      <p className="break-words text-sm font-medium leading-5 text-white">
        {workspaceName}
      </p>
    </div>
  );
}

function MobileNavigation({ user, accountActions }: { user: SessionUser; accountActions: ReactNode }) {
  const { t } = useLocale();
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
        aria-label={t("Open navigation")}
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
        className="fixed inset-y-0 start-0 end-auto m-0 h-dvh max-h-none w-72 max-w-[84vw] border-0 bg-sidebar-navy p-0 text-sidebar-foreground shadow-lg backdrop:bg-sidebar-navy/55"
      >
        <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
            <h2 id="mobile-navigation-title" className="sr-only">{t("Open navigation")}</h2>
            <FleetoraBrand />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("Close navigation")}
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
          <WorkspaceNavigation user={user} onNavigate={() => setOpen(false)} />
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
    <aside aria-label="Workspace sidebar" className="sticky top-0 hidden h-dvh min-h-0 w-[272px] shrink-0 flex-col bg-sidebar-navy text-sidebar-foreground lg:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-6">
        <FleetoraBrand />
      </div>
      <WorkspaceNavigation user={user} />
      <div className="mt-auto">
        <SidebarAccount user={user} accountActions={accountActions} />
      </div>
    </aside>
  );
}

function WorkspaceContext({ user }: { user: SessionUser }) {
  const { t } = useLocale();
  const companyName = user.company?.name;

  return (
    <p className={styles.workspaceName} title={companyName ?? t("Platform administration")}>
      {companyName ?? t("Platform administration")}
    </p>
  );
}

export function AppShell({ user, accountActions, children }: { user: SessionUser; accountActions: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const { t, locale } = useLocale();
  const pageTitle = t(navigation.find(item => item.href === pathname || item.href !== "/app" && pathname.startsWith(`${item.href}/`))?.label ?? "Overview");
  const mapPage = pathname === "/app/live-map";
  useEffect(() => {
    document.title = `${pageTitle} | Fleetora`;
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale, pageTitle]);
  return (
    <div className={`flex w-full bg-background text-foreground ${mapPage ? "h-dvh overflow-hidden" : "min-h-svh"}`}>
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-surface px-4 py-3 font-medium text-foreground shadow-md outline-none focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus-visible:ring-2 focus-visible:ring-primary"
      >
        {t("Skip to content")}
      </a>
      <DesktopSidebar user={user} accountActions={accountActions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center border-b border-border bg-surface px-4 sm:px-6 lg:px-8">
          <div className="flex w-full min-w-0 items-center gap-3">
            <h1 className={styles.headerTitle} title={pageTitle}>{pageTitle}</h1>
            <div className="ms-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
              <WorkspaceContext user={user} />
              <LanguageSwitcher />
              <div className="lg:hidden">
                <MobileNavigation user={user} accountActions={accountActions} />
              </div>
            </div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className={`min-w-0 flex-1 outline-none ${mapPage ? "min-h-0 overflow-hidden" : "px-4 py-6 sm:px-6 lg:px-8"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
