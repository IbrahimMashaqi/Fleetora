"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, ArrowRight, Building2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth/session.types";
import { useLocale } from "@/lib/i18n";
import { useFleet } from "../use-fleet";
import { countDriverLocationStates } from "../fleet-state";
import { relativeLocation } from "../fleet-display";

const FleetMap = dynamic(() => import("./fleet-map"), { ssr: false });

export function FleetPreview({ user }: { user: SessionUser }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const fleet = useFleet(user);
  const [mapAvailable, setMapAvailable] = useState(false);
  const snapshot = fleet.snapshot;
  const drivers = snapshot?.drivers ?? [];
  const counts = countDriverLocationStates(drivers, fleet.now, snapshot?.freshnessSeconds ?? 60);
  const locations = drivers.flatMap(driver => driver.tracking.location ? [driver.tracking.location.receivedAt] : []);
  const lastUpdate = locations.length ? locations.reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest) : null;
  return (
    <section dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} className="overflow-hidden rounded-lg border bg-surface" aria-labelledby="fleet-preview-title">
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <div>
          <h2 id="fleet-preview-title" className="flex items-center gap-2 text-base font-semibold">
            <MapPin aria-hidden="true" className="size-5 text-primary-hover" />
            {t("Live Tracking")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("See your fleet at a glance")}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="min-h-10 bg-surface shadow-none">
          <Link href="/app/live-map">
            {t("Open full map")}
            <ArrowRight aria-hidden="true" className={locale === "ar" ? "rotate-180" : undefined} />
          </Link>
        </Button>
      </div>
      <div className="border-y bg-secondary/50">
        <dl aria-busy={fleet.loading} className="grid grid-cols-3 px-4 pb-3 pt-5 text-xs sm:px-6">
          <div className="min-w-0 pe-3 sm:pe-6">
            <dt className="min-h-10 leading-5 text-muted-foreground sm:min-h-5">{t("Connected drivers")}</dt>
            <dd className="mt-2 text-2xl font-semibold leading-8 tabular-nums">{snapshot ? counts.online.toLocaleString(locale) : "—"}</dd>
          </div>
          <div className="min-w-0 border-s px-3 sm:px-6">
            <dt className="min-h-10 leading-5 text-muted-foreground sm:min-h-5">{t("Offline drivers")}</dt>
            <dd className="mt-2 text-2xl font-semibold leading-8 tabular-nums">{snapshot ? counts.offline.toLocaleString(locale) : "—"}</dd>
          </div>
          <div className="min-w-0 border-s ps-3 sm:ps-6">
            <dt className="min-h-10 leading-5 text-muted-foreground sm:min-h-5">{t("No location yet")}</dt>
            <dd className="mt-2 text-2xl font-semibold leading-8 tabular-nums">{snapshot ? counts.noLocation.toLocaleString(locale) : "—"}</dd>
          </div>
        </dl>
        <p className="px-4 pb-4 text-xs leading-5 text-muted-foreground sm:px-6">
          {t("Last update")}: {!snapshot ? "—" : lastUpdate ? relativeLocation(lastUpdate, fleet.now, locale) : t("No updates yet")}
        </p>
      </div>
      <div className="relative h-80 overflow-hidden sm:h-[360px]">
        <FleetMap preview drivers={drivers} headquarters={snapshot?.headquarters ?? null} companyName={user.company?.name ?? ""} now={fleet.now} freshnessSeconds={snapshot?.freshnessSeconds ?? 60} connected={fleet.connection === "connected"} onAvailabilityChange={setMapAvailable} onPreviewClick={() => router.push("/app/live-map")} />
        {mapAvailable && snapshot && !locations.length && (
          <p className="pointer-events-none absolute inset-x-4 top-4 mx-auto max-w-lg rounded-md border bg-surface px-4 py-3 text-center text-xs leading-6 text-foreground shadow-sm">{t("Driver locations will appear here once location sharing is enabled in the driver app.")}</p>
        )}
      </div>
      {(snapshot && !snapshot.headquarters || fleet.loading || fleet.error) && (
        <div className="space-y-3 border-t p-4 sm:px-6">
          {snapshot && !snapshot.headquarters && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-xs font-medium">
                <Building2 aria-hidden="true" className="size-4 text-muted-foreground" />
                {t("Headquarters is not set")}
              </p>
              <Button asChild size="sm" className="min-h-10">
                <Link href="/app/live-map">{t("Set your company headquarters")}</Link>
              </Button>
            </div>
          )}
          {fleet.loading && <p role="status" className="text-xs leading-5 text-muted-foreground">{t("Loading fleet data...")}</p>}
          {fleet.error && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-danger-border bg-danger-background px-4 py-3 text-xs leading-5">
              <AlertCircle aria-hidden="true" className="size-4 shrink-0 text-danger-foreground" />
              <p className="min-w-0 flex-1 basis-40">{t(fleet.error === "unavailable" ? "Fleet tracking is temporarily unavailable. Please try again." : fleet.error === "access" ? "Your company access changed. Reload the page to continue." : "Live updates are disconnected. Showing the latest locations.")}</p>
              <Button variant="outline" size="sm" className="min-h-10 shrink-0 bg-surface shadow-none" onClick={fleet.retry}>{t("Retry")}</Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
