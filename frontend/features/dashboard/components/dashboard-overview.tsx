import Link from "next/link";
import { ArrowRight, Banknote, ClipboardList, ReceiptText, ShieldCheck, Truck, UsersRound } from "lucide-react";
import type { SessionUser } from "@/lib/auth/session.types";
import { useLocale } from "@/lib/i18n";
import { FleetPreview } from "@/features/fleet/components/fleet-preview";
import { OverviewSection } from "./overview-section";

const workspaceLinks = [
  { href: "/app/operations", label: "Operations dashboard", description: "Parcels", icon: ClipboardList },
  { href: "/app/drivers", label: "Drivers", description: "Find and view the delivery drivers in your company.", icon: UsersRound },
  { href: "/app/vehicles", label: "Vehicles", description: "Keep your company fleet ready for assignment.", icon: Truck },
] as const;

const accountantLinks = [
  workspaceLinks[0],
  { href: "/app/collections", label: "COD & collections", description: "Collection and remittance are separate recorded events.", icon: Banknote },
  { href: "/app/settlements", label: "Merchant settlements", description: "Merchant payables", icon: ReceiptText },
] as const;

const accountLinks = [
  { href: "/app/account", label: "Account & security", description: "Review your account and keep your password up to date.", icon: ShieldCheck },
] as const;

export function DashboardOverview({ user }: { user: SessionUser }) {
  const { locale, t } = useLocale();
  const companyAdmin = user.role === "COMPANY_ADMIN" && user.company !== null;
  const links = companyAdmin
    ? workspaceLinks
    : user.role === "ACCOUNTANT"
      ? user.company ? accountantLinks : accountLinks
      : user.role === "MERCHANT" ? accountLinks : [];

  return (
    <div className="w-full space-y-6">
      {user.role === "PLATFORM_ADMIN" && !user.company && (
        <p className="mb-6 max-w-2xl text-sm leading-6 text-foreground">{t("You are signed in with platform-level access and no company workspace.")}</p>
      )}
      {links.length > 0 && (
        <>
          {!companyAdmin && <h2 className="text-2xl font-semibold leading-8 tracking-tight text-brand-navy">{t("Workspace")}</h2>}
          {companyAdmin && user.company && <FleetPreview key={`${user.id}:${user.company.id}`} user={user} />}
          {companyAdmin && user.company && <OverviewSection key={`overview:${user.id}:${user.company.id}`} user={user} />}
          <nav aria-label={t("Workspace")} className={`grid divide-y rounded-lg border bg-surface ${links.length > 1 ? "md:grid-cols-3 md:divide-x md:divide-y-0 rtl:md:divide-x-reverse" : "max-w-xl"}`}>
            {links.map(({ href, label, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`group flex min-w-0 items-start gap-3 p-5 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-secondary focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none ${links.length > 1 ? "md:first:rounded-s-lg md:first:rounded-e-none md:last:rounded-s-none md:last:rounded-e-lg" : "rounded-lg"}`}
              >
                <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground group-hover:text-primary-hover" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-5">{t(label)}</p>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t(description)}</p>
                </div>
                <ArrowRight aria-hidden="true" className={`mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-primary-hover ${locale === "ar" ? "rotate-180" : ""}`} />
              </Link>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
