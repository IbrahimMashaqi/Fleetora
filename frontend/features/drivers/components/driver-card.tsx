import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import type { Driver } from "../drivers.types";
import { DriverStatusBadge } from "./driver-status";
import { DriverVehicleSummary } from "./driver-vehicle";

export function DriverCard({
  driver,
  onSelect,
}: {
  driver: Driver;
  onSelect: () => void;
}) {
  const { t } = useLocale();
  const name = driver.name.trim() || t("Name not provided");
  const parts = driver.name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length
    ? Array.from(parts[0])[0] +
      (parts.length > 1 ? Array.from(parts[parts.length - 1])[0] : "")
    : "?";
  return (
    <li className="min-w-0">
      <article
        aria-labelledby={`driver-${driver.id}`}
        className="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-strong focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 motion-reduce:transition-none"
      >
        <div className="flex flex-1 items-start gap-3 p-5">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface-secondary text-sm font-semibold uppercase text-foreground"
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <h3
              id={`driver-${driver.id}`}
              className="text-base font-semibold leading-6 [overflow-wrap:anywhere]"
            >
              <bdi>{name}</bdi>
            </h3>
            <p className="mt-1 text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
              <bdi>{driver.phone || t("Phone not provided")}</bdi>
            </p>
            <div className="mt-3">
              <DriverStatusBadge status={driver.status} />
            </div>
          </div>
        </div>
        <div className="border-y border-border bg-surface-secondary/60 px-5 py-4">
          <DriverVehicleSummary vehicle={driver.vehicle} />
        </div>
        <div className="px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            aria-label={t("View {name}", { name: driver.name || t("Driver") })}
            className="min-h-10 w-full justify-between text-accent-foreground"
            onClick={onSelect}
          >
            {t("View details")}
            <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
          </Button>
        </div>
      </article>
    </li>
  );
}

export function DriverCardSkeletons({
  label = "Loading drivers...",
}: {
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-lg border border-border bg-surface motion-safe:animate-pulse"
          >
            <div className="flex gap-3 p-5">
              <div className="size-10 shrink-0 rounded-full bg-muted" />
              <div className="flex-1 space-y-3">
                <div className="h-5 w-3/4 rounded bg-muted" />
                <div className="h-4 w-full rounded bg-muted" />
                <div className="h-6 w-20 rounded bg-muted" />
              </div>
            </div>
            <div className="border-y border-border bg-muted p-5">
              <div className="h-14 rounded bg-surface" />
            </div>
            <div className="p-4">
              <div className="h-5 w-24 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
