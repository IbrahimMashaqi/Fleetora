import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n";
import type { DriverResult } from "../drivers.types";

export function DriverAccessDenied() {
  const { t } = useLocale();
  return (
    <section
      className="mx-auto max-w-3xl"
      aria-labelledby="driver-access-title"
    >
      <h2 id="driver-access-title" className="text-xl font-semibold">
        {t("Company administrator access required")}
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {t("This directory is available to company administrators in their own workspace.")}
      </p>
      <Button asChild variant="outline" className="mt-5">
        <Link href="/app">{t("Back to Overview")}</Link>
      </Button>
    </section>
  );
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
      <p role="alert" className="text-sm leading-6">
        {message}
      </p>
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
