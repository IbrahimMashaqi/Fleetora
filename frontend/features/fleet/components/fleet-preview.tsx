"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth/session.types";
import { useLocale } from "@/lib/i18n";
import { useFleet } from "../use-fleet";
import { isDriverOnline } from "../fleet-state";
import { relativeLocation } from "../fleet-display";
import { FleetIcon } from "./fleet-icons";

const FleetMap = dynamic(() => import("./fleet-map"), { ssr: false });

export function FleetPreview({ user }: { user: SessionUser }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const fleet = useFleet(user);
  const [mapAvailable, setMapAvailable] = useState(false);
  const snapshot = fleet.snapshot;
  const drivers = snapshot?.drivers ?? [];
  const online = drivers.filter(driver => isDriverOnline(driver, fleet.now, snapshot?.freshnessSeconds ?? 60)).length;
  const locations = drivers.flatMap(driver => driver.tracking.location ? [driver.tracking.location.receivedAt] : []);
  const lastUpdate = locations.length ? locations.reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest) : null;
  return <section dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} className="overflow-hidden rounded-xl border bg-surface" aria-labelledby="fleet-preview-title">
    <div className="flex flex-wrap items-center justify-between gap-4 p-5"><div><h2 id="fleet-preview-title" className="flex items-center gap-2 text-base font-semibold"><FleetIcon className="size-5 text-primary-hover" />{t("Live Tracking")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("A clearer view of your company fleet")}</p></div><Button asChild variant="outline" size="sm"><Link href="/app/live-map">{t("Open full map")}<FleetIcon name="arrow" className={locale === "en" ? "size-5 rotate-180" : "size-5"} /></Link></Button></div>
    <dl className="grid grid-cols-3 border-y bg-secondary px-5 py-4 text-xs"><div><dt className="text-muted-foreground">{t("Connected drivers")}</dt><dd className="mt-2 text-lg font-semibold tabular-nums">{snapshot ? online.toLocaleString(locale) : "—"}</dd></div><div className="border-s px-4"><dt className="text-muted-foreground">{t("Offline drivers")}</dt><dd className="mt-2 text-lg font-semibold tabular-nums">{snapshot ? (drivers.length - online).toLocaleString(locale) : "—"}</dd></div><div className="border-s ps-4"><dt className="text-muted-foreground">{t("Last update")}</dt><dd className="mt-2 leading-7">{!snapshot ? "\u2014" : lastUpdate ? relativeLocation(lastUpdate, fleet.now, locale) : t("No updates yet")}</dd></div></dl>
    <div className="relative h-[340px] overflow-hidden">
      <FleetMap preview drivers={drivers} headquarters={snapshot?.headquarters ?? null} companyName={user.company?.name ?? ""} now={fleet.now} freshnessSeconds={snapshot?.freshnessSeconds ?? 60} connected={fleet.connection === "connected"} onAvailabilityChange={setMapAvailable} onPreviewClick={() => router.push("/app/live-map")} />
      {mapAvailable && snapshot && !locations.length && <p className="pointer-events-none absolute inset-x-4 top-4 rounded-lg border bg-surface/95 px-4 py-3 text-center text-xs leading-6 text-muted-foreground">{t("Driver locations will appear here once location sharing is enabled in the driver app.")}</p>}
    </div>
    {(snapshot && !snapshot.headquarters || fleet.loading || fleet.error) && <div className="space-y-3 border-t p-4">
      {snapshot && !snapshot.headquarters && <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-medium">{t("Headquarters is not set")}</p><Button asChild size="sm"><Link href="/app/live-map">{t("Set your company headquarters")}<FleetIcon name="building" /></Link></Button></div>}
      {fleet.loading && <p className="text-xs text-muted-foreground">{t("Loading fleet data...")}</p>}
      {fleet.error && <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-danger-border bg-surface p-3 text-xs"><p>{t(fleet.error === "unavailable" ? "Fleet tracking is temporarily unavailable. Please try again." : fleet.error === "access" ? "Your company access changed. Reload the page to continue." : "Live updates are disconnected. Showing the latest locations.")}</p><Button variant="outline" size="sm" onClick={fleet.retry}>{t("Retry")}</Button></div>}
    </div>}
  </section>;
}
