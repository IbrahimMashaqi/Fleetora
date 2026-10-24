"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/lib/i18n";
import type { FleetDriver } from "../fleet.types";
import { isDriverOnline } from "../fleet-state";
import { driverVehicle, relativeLocation, validTelephone } from "../fleet-display";
import { FleetIcon } from "./fleet-icons";
import styles from "./fleet-map.module.css";

export function DriverPanel({ drivers, now, freshnessSeconds, selectedId, loading, available, connected, onSelect, onCollapse }: { drivers: FleetDriver[]; now: number; freshnessSeconds: number; selectedId: string | null; loading: boolean; available: boolean; connected: boolean; onSelect: (id: string) => void; onCollapse: () => void }) {
  const { locale, t } = useLocale();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
  const [visibleLimit, setVisibleLimit] = useState(100);
  const query = useDeferredValue(search.trim().toLocaleLowerCase(locale));
  const visible = useMemo(() => drivers.filter(driver => {
    const online = isDriverOnline(driver, now, freshnessSeconds);
    return (filter === "all" || (filter === "online" ? online : !online)) && `${driver.name} ${driver.phone} ${driver.vehicle?.plateNumber ?? ""}`.toLocaleLowerCase(locale).includes(query);
  }), [drivers, now, freshnessSeconds, filter, query, locale]);
  return <aside className={styles.panel} aria-label={t("Driver list")}>
    <div className="shrink-0 border-b p-4">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><FleetIcon name="drivers" className="size-5 text-primary-hover" /><h2 className="text-base font-semibold">{t("Drivers")}</h2><span className="rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{loading || !available ? "\u2014" : drivers.length.toLocaleString(locale)}</span></div><Button size="icon" variant="ghost" aria-label={t("Hide driver list")} onClick={onCollapse}><FleetIcon name="chevron" /></Button></div>
      <div className="relative mt-4"><label htmlFor="fleet-driver-search" className="sr-only">{t("Search drivers by name, phone or vehicle plate")}</label><FleetIcon name="search" className="pointer-events-none absolute end-3 top-3 size-4 text-muted-foreground" /><Input id="fleet-driver-search" value={search} onChange={event => { setSearch(event.target.value); setVisibleLimit(100); }} placeholder={t("Search for a driver...")} className="ps-9" /></div>
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-md bg-secondary p-1" aria-label={t("Drivers")} role="group">{([{ value: "all", label: t("All") }, { value: "online", label: t("Online") }, { value: "offline", label: t("Offline") }] as const).map(item => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => { setFilter(item.value); setVisibleLimit(100); }} className={`min-h-9 rounded-md px-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary ${filter === item.value ? "bg-surface text-primary-hover shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}</div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" aria-busy={loading}>
      {loading && <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t("Loading drivers...")}</p>}
      {!loading && !available && <p className="px-5 py-8 text-center text-sm leading-6 text-muted-foreground">{t("Could not load driver data. Try again when the connection is restored.")}</p>}
      {!loading && available && !drivers.length && <div className="px-5 py-8 text-center"><FleetIcon name="drivers" className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-medium">{t("No drivers have been added yet")}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("Add drivers to your company to see your fleet here.")}</p><Button asChild variant="outline" className="mt-4"><Link href="/app/drivers">{t("Add driver")}</Link></Button></div>}
      {!loading && drivers.length > 0 && !visible.length && <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t("No drivers match your search and filters.")}</p>}
      <ul className="space-y-1">{visible.slice(0, visibleLimit).map(driver => {
        const online = isDriverOnline(driver, now, freshnessSeconds);
        const status = online ? connected ? t("Online now") : t("Recent location — updates paused") : driver.tracking.location ? t("Previous location") : t("Has not shared a location");
        return <li key={driver.id}><button type="button" aria-pressed={driver.id === selectedId} onClick={() => onSelect(driver.id)} className={`flex w-full items-start gap-3 rounded-lg border p-3 text-right outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${driver.id === selectedId ? "border-primary bg-primary-subtle" : "border-transparent hover:bg-secondary"}`}>
          <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-brand-navy">{driver.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}<span className={`absolute bottom-0 start-0 size-3 rounded-full border-2 border-surface ${online && connected ? "bg-success" : "bg-muted-foreground"}`} /></span>
          <span className="min-w-0 flex-1 text-start"><span className="block truncate text-sm font-semibold">{driver.name}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{driverVehicle(driver, locale)}{driver.vehicle && <> · <bdi>{driver.vehicle.plateNumber}</bdi></>}</span><span className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${online && connected ? "text-success" : "text-muted-foreground"}`}><span>{status}</span>{driver.tracking.location && <span className="text-muted-foreground">{relativeLocation(driver.tracking.location.receivedAt, now, locale)}</span>}</span></span>
        </button></li>;
      })}</ul>
      {visible.length > visibleLimit && <div className="p-3 text-center"><p className="mb-3 text-xs text-muted-foreground">{t("Showing {shown} of {total} drivers", { shown: visibleLimit.toLocaleString(locale), total: visible.length.toLocaleString(locale) })}</p><Button variant="outline" className="w-full" onClick={() => setVisibleLimit(limit => limit + 100)}>{t("Show more drivers")}</Button></div>}
    </div>
    <p className="shrink-0 border-t px-4 py-3 text-xs leading-5 text-muted-foreground">{t("Driver status reflects the latest actual location sharing.")}</p>
  </aside>;
}

export function DriverDetails({ driver, now, freshnessSeconds, connected, following, onFollow, onClose }: { driver: FleetDriver; now: number; freshnessSeconds: number; connected: boolean; following: boolean; onFollow: () => void; onClose: () => void }) {
  const { locale, t } = useLocale();
  const location = driver.tracking.location;
  const online = isDriverOnline(driver, now, freshnessSeconds);
  const telephone = validTelephone(driver.phone);
  return <section className={`${styles.details} rounded-xl border bg-surface shadow-md`} aria-label={t("Details for {name}", { name: driver.name })}>
    <div className="flex items-start justify-between gap-3 border-b p-4"><div className="min-w-0"><p className="text-xs text-muted-foreground">{t("Driver details")}</p><h2 className="mt-1 break-words text-base font-semibold">{driver.name}</h2><p className={`mt-2 text-xs ${online && connected ? "text-success" : "text-muted-foreground"}`}>{!location ? t("Location not shared") : !connected ? t("Last known location · connection lost") : online ? t("Online now") : t("Previous location")}</p></div><Button size="icon" variant="ghost" aria-label={t("Close driver details")} onClick={onClose}><FleetIcon name="close" /></Button></div>
    <dl className="space-y-3 p-4 text-sm"><div><dt className="text-xs text-muted-foreground">{t("Vehicle")}</dt><dd className="mt-1">{driverVehicle(driver, locale)}{driver.vehicle && <bdi className="ms-2 text-muted-foreground">{driver.vehicle.plateNumber}</bdi>}</dd></div>{driver.phone && <div><dt className="text-xs text-muted-foreground">{t("Phone")}</dt><dd className="mt-1"><bdi>{driver.phone}</bdi></dd></div>}
      {location ? <><div><dt className="text-xs text-muted-foreground">{t("Last location update")}</dt><dd className="mt-1"><time dateTime={location.capturedAt} title={new Date(location.capturedAt).toLocaleString(locale)}>{relativeLocation(location.receivedAt, now, locale)}</time><span className="mt-1 block text-xs text-muted-foreground">{new Date(location.capturedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</span></dd></div><div className="grid grid-cols-3 gap-2 border-y py-3">{[{ label: t("Speed"), value: location.speed === null ? t("Unavailable") : `${Math.round(location.speed * 3.6).toLocaleString(locale)} ${t("km/h")}` }, { label: t("Heading"), value: location.heading === null ? t("Unavailable") : `${Math.round(location.heading).toLocaleString(locale)}°` }, { label: t("Accuracy"), value: location.accuracy === null ? t("Unavailable") : `${Math.round(location.accuracy).toLocaleString(locale)} ${t("m")}` }].map(item => <div key={item.label}><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className="mt-1 text-xs font-medium">{item.value}</dd></div>)}</div><div><dt className="text-xs text-muted-foreground">{t("Coordinates")}</dt><dd className="mt-1 text-xs tabular-nums" dir="ltr">{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</dd></div></> : <p className="rounded-md bg-secondary p-3 text-sm leading-6 text-muted-foreground">{t("Driver location will appear here once location sharing is enabled in the driver app.")}</p>}
    </dl>
    <div className="flex gap-2 border-t p-4">{telephone && <Button asChild variant="outline"><a href={`tel:${telephone}`}><FleetIcon name="phone" />{t("Call")}</a></Button>}<Button className="flex-1" disabled={!online || !connected} onClick={onFollow} aria-pressed={following}><FleetIcon name="focus" />{following ? t("Stop following") : t("Follow this driver")}</Button></div>
  </section>;
}
