import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n";
import { NoAccess } from "@/components/shared/no-access";
import type { DriverResult } from "../drivers.types";

export function DriverAccessDenied() {
  return <NoAccess />;
}

export function DriverReadError({
  status,
  retry,
}: {
  status: DriverResult["status"];
  retry: () => void;
}) {
  const { t } = useLocale();
  if (status === "forbidden") return <DriverAccessDenied />;
  const message =
    status === "not-found"
      ? t("Driver not found.")
      : status === "invalid"
        ? t("Check the search and page values, then try again.")
        : status === "changed"
          ? t("Your session changed. Reload this page to continue.")
          : t("We couldn’t load drivers. Please try again.");
  return (
    <div className="rounded-lg border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0 text-danger-foreground" />
        <p role="alert" className="text-sm leading-6">
          {message}
        </p>
      </div>
      {status === "unavailable" && (
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={retry}
        >
          {t("Try again")}
        </Button>
      )}
      {status === "changed" && (
        <Button asChild variant="outline" className="mt-4">
          <a href="/app/drivers">{t("Reload directory")}</a>
        </Button>
      )}
      {status === "invalid" && (
        <Button asChild variant="outline" className="mt-4">
          <Link href="/app/drivers">{t("Reset search")}</Link>
        </Button>
      )}
    </div>
  );
}
