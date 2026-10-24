import type { SessionUser } from "@/lib/auth/session.types";
import { useLocale } from "@/lib/i18n";
import { FleetPreview } from "@/features/fleet/components/fleet-preview";

export function DashboardOverview({ user }: { user: SessionUser }) {
  const { t } = useLocale();
  return (
    <div className="w-full">
      {user.role === "PLATFORM_ADMIN" && !user.company && (
        <p className="mb-6 max-w-2xl text-sm leading-6 text-foreground">{t("You are signed in with platform-level access and no company workspace.")}</p>
      )}
      {user.role === "COMPANY_ADMIN" && user.company && <FleetPreview key={`${user.id}:${user.company.id}`} user={user} />}
    </div>
  );
}
