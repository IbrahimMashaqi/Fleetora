"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Banknote, Building2, ChevronDown, ClipboardList, LayoutDashboard, MapPin, Package, ReceiptText, RotateCcw, Settings2, Store, Tags, Truck, TruckElectric, UserRoundCheck, Wallet, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher, useLocale, type TranslationKey } from "@/lib/i18n";
import type { SessionUser } from "@/lib/auth/session.types";
import styles from "./app-shell.module.css";

type NavigationItem = {
  href: string;
  label: TranslationKey;
  title?: TranslationKey;
  icon: LucideIcon;
  group: TranslationKey | null;
};

const navigation: NavigationItem[] = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, group: "Workspace" },
  { href: "/app/live-map", label: "Live Tracking", icon: MapPin, group: "Workspace" },
  { href: "/app/operations", label: "Operations dashboard", title: "Parcel operations", icon: ClipboardList, group: "Parcel operations" },
  { href: "/app/parcels", label: "Parcels", icon: Package, group: "Parcel operations" },
  { href: "/app/pickups", label: "Pickup requests", icon: Truck, group: "Parcel operations" },
  { href: "/app/requests", label: "Merchant requests", icon: ReceiptText, group: "Parcel operations" },
  { href: "/app/pricing", label: "Delivery pricing", icon: Tags, group: "Company resources" },
  { href: "/app/merchants", label: "Merchants", icon: Store, group: "Company resources" },
  { href: "/app/drivers", label: "Drivers", icon: UserRoundCheck, group: "Company resources" },
  { href: "/app/vehicles", label: "Vehicles", icon: TruckElectric, group: "Company resources" },
  { href: "/app/returns", label: "Returns", icon: RotateCcw, group: "Returns & finance" },
  { href: "/app/collections", label: "COD & collections", icon: Banknote, group: "Returns & finance" },
  { href: "/app/settlements", label: "Merchant settlements", icon: Wallet, group: "Returns & finance" },
  { href: "/app/account", label: "Account & security", icon: Settings2, group: null },
];

const navigationGroups = ["Workspace", "Parcel operations", "Company resources", "Returns & finance"] as const;

function matchesRoute(pathname: string, href: string) {
  return pathname === href || href !== "/app" && pathname.startsWith(`${href}/`);
}

function NavigationLink({ item, onNavigate }: { item: NavigationItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useLocale();
  const active = matchesRoute(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`${styles.sidebarItem} ${active ? styles.active : ""}`}
    >
      <Icon aria-hidden="true" strokeWidth={1.7} />
      <span>{t(item.label)}</span>
    </Link>
  );
}

function NavigationGroup({ label, items, onNavigate }: { label: TranslationKey; items: NavigationItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useLocale();
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const active = items.some(item => matchesRoute(pathname, item.href));
  const [state, setState] = useState({ pathname, expanded: true });

  // Reveal a newly visited route without resetting the user's other groups.
  if (state.pathname !== pathname) {
    setState({ pathname, expanded: active || state.expanded });
  }

  useEffect(() => {
    if (active && state.expanded) {
      panelRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    }
  }, [active, pathname, state.expanded]);

  return (
    <div>
      <button
        type="button"
        aria-expanded={state.expanded}
        aria-controls={panelId}
        className={styles.navigationGroup}
        onClick={() => setState({ pathname, expanded: !state.expanded })}
      >
        <span>{t(label)}</span>
        <ChevronDown aria-hidden="true" strokeWidth={1.7} className={state.expanded ? "" : styles.groupCollapsed} />
      </button>
      <div id={panelId} ref={panelRef} hidden={!state.expanded}>
        {items.map(item => <NavigationLink key={item.href} item={item} onNavigate={onNavigate} />)}
      </div>
    </div>
  );
}

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
  const { t } = useLocale();
  const visible = navigation.filter(item => ["/app", "/app/account"].includes(item.href) || user.company !== null && (user.role === "COMPANY_ADMIN" || user.role === "ACCOUNTANT" && ["/app/operations", "/app/parcels", "/app/merchants", "/app/returns", "/app/collections", "/app/settlements", "/app/requests"].includes(item.href)));
  return (
    <nav aria-label={t("Primary navigation")} className={styles.navigation}>
      {navigationGroups.map(label => {
        const items = visible.filter(item => item.group === label);
        return items.length > 0 ? <NavigationGroup key={label} label={label} items={items} onNavigate={onNavigate} /> : null;
      })}
    </nav>
  );
}

function SidebarAccount({ user, accountActions, onNavigate }: { user: SessionUser; accountActions: ReactNode; onNavigate?: () => void }) {
  const { t } = useLocale();
  const roleLabel = user.role === "COMPANY_ADMIN"
    ? t("Company administrator")
    : user.role === "PLATFORM_ADMIN"
      ? t("Platform administrator")
      : user.role === "MERCHANT"
        ? t("Merchant")
        : t("Accountant");
  return (
    <div className="min-w-0 shrink-0 border-t border-white/10 px-3 pt-4 pb-4">
      <div className="mb-3 flex min-w-0 items-center gap-3 px-3">
        <span aria-hidden="true" className={styles.accountAvatar}>{user.name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join("")}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white" title={user.name}>{user.name}</p>
          <p className="mt-1 truncate text-xs text-sidebar-foreground/80">{roleLabel}</p>
        </div>
      </div>
      <NavigationLink item={{ href: "/app/account", label: "Account & security", icon: Settings2, group: null }} onNavigate={onNavigate} />
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

    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector('nav [aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    }
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
        onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}
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
          <SidebarAccount user={user} accountActions={accountActions} onNavigate={() => setOpen(false)} />
        </div>
      </dialog>
    </>
  );
}

function DesktopSidebar({ user, accountActions }: { user: SessionUser; accountActions: ReactNode }) {
  return (
    <aside aria-label="Workspace sidebar" className="sticky top-0 hidden h-dvh min-h-0 w-[248px] shrink-0 flex-col bg-sidebar-navy text-sidebar-foreground lg:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-6">
        <FleetoraBrand />
      </div>
      <WorkspaceNavigation user={user} />
      <SidebarAccount user={user} accountActions={accountActions} />
    </aside>
  );
}

function WorkspaceContext({ user }: { user: SessionUser }) {
  const { t } = useLocale();
  const companyName = user.company?.name;

  return (
    <p className={styles.workspaceName} title={companyName ?? t("Platform administration")}>
      <Building2 aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.7} />
      <span className="truncate">{companyName ?? t("Platform administration")}</span>
    </p>
  );
}

export function AppShell({ user, accountActions, children }: { user: SessionUser; accountActions: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const { t, locale } = useLocale();
  const page = navigation.find(item => matchesRoute(pathname, item.href));
  const pageTitle = t(page?.title ?? page?.label ?? "Overview");
  const mapPage = pathname === "/app/live-map";
  useEffect(() => {
    document.title = `${pageTitle} | Fleetora`;
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale, pageTitle]);
  return (
    <div className={`flex min-w-0 w-full bg-background text-foreground ${mapPage ? "h-dvh overflow-hidden" : "min-h-svh"}`}>
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
