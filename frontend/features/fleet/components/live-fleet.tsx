"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n";
import { useProtectedSession } from "@/features/auth/session/session-context";
import type { SessionUser } from "@/lib/auth/session.types";
import { useFleet } from "../use-fleet";
import { isDriverOnline } from "../fleet-state";
import { fleetConnectionLabel } from "../fleet-display";
import type { MapCoordinate } from "./fleet-map";
import { DriverDetails, DriverPanel } from "./driver-panel";
import { HeadquartersEditor } from "./headquarters-editor";
import { FleetIcon } from "./fleet-icons";
import styles from "./fleet-map.module.css";

const FleetMap = dynamic(() => import("./fleet-map"), { ssr: false });

export function LiveFleetPage() {
  const { user } = useProtectedSession();
  const { locale, t } = useLocale();
  if (user.role !== "COMPANY_ADMIN" || !user.company) return <div dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} className="m-6 rounded-lg border bg-surface p-6"><h2 className="text-lg font-semibold">{t("Live Tracking")}</h2><p className="mt-3 text-muted-foreground">{t("This area is available to company administrators to view their fleet.")}</p><Button asChild variant="outline" className="mt-4"><Link href="/app">{t("Back to Overview")}</Link></Button></div>;
  return <LiveFleet key={`${user.id}:${user.company.id}`} user={user} />;
}

function LiveFleet({ user }: { user: SessionUser }) {
  const { locale, t } = useLocale();
  const fleet = useFleet(user);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [focusRequest, setFocusRequest] = useState(0);
  const [draftFocusRequest, setDraftFocusRequest] = useState(0);
  const [fitRequest, setFitRequest] = useState(0);
  const [editor, setEditor] = useState<{ expectedRevision: number; address: string } | null>(null);
  const [draft, setDraft] = useState<MapCoordinate | null>(null);
  const [notice, setNotice] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const snapshot = fleet.snapshot;
  const drivers = snapshot?.drivers ?? [];
  const selected = drivers.find(driver => driver.id === selectedId);
  const connected = fleet.connection === "connected";
  const freshSeconds = snapshot?.freshnessSeconds ?? 60;
  const canFollow = selected && connected && isDriverOnline(selected, fleet.now, freshSeconds);
  if (following && !canFollow) setFollowing(false);
  const activeFollow = following && Boolean(canFollow);
  function editHeadquarters() { setSelectedId(null); setFollowing(false); setDraft(snapshot?.headquarters ?? null); setEditor({ expectedRevision: snapshot?.headquarters?.revision ?? 0, address: snapshot?.headquarters?.address ?? "" }); setNotice(""); }
  function closeEditor() { setEditor(null); setDraft(null); requestAnimationFrame(() => editButton.current?.focus()); }
  function selectDriver(id: string) { setSelectedId(id); setFollowing(false); setFocusRequest(value => value + 1); }
  return <div dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} className="relative isolate h-full min-h-0 w-full overflow-hidden bg-secondary" aria-label={t("Live Tracking")}>
    <div className={`${styles.mapViewport} ${panelOpen && !editor ? styles.withPanel : ""}`}>
      <FleetMap drivers={drivers} headquarters={snapshot?.headquarters ?? null} companyName={user.company?.name ?? ""} now={fleet.now} freshnessSeconds={freshSeconds} connected={connected} selectedId={selectedId} follow={activeFollow} focusRequest={focusRequest} fitRequest={fitRequest} draftFocusRequest={draftFocusRequest} editing={editor !== null} draft={draft} onCoordinate={setDraft} onSelect={selectDriver} onManualMove={() => setFollowing(false)} onEditHeadquarters={snapshot ? editHeadquarters : undefined} />
    </div>
    <div className={`absolute end-4 top-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 ${panelOpen ? "md:max-w-[calc(100%-360px)]" : ""}`}>
      <div className="flex min-h-10 items-center gap-2 rounded-lg border bg-surface px-3 shadow-sm" role="status"><span className={`size-2 shrink-0 rounded-full ${connected ? "bg-success" : fleet.connection === "disconnected" ? "bg-destructive" : "bg-warning"}`} /><span className="text-xs font-medium">{t(fleetConnectionLabel(fleet.connection, drivers, fleet.now, freshSeconds))}</span></div>
      <Button variant="outline" onClick={() => { setFollowing(false); setFitRequest(value => value + 1); }} className="min-h-10 bg-surface text-xs shadow-sm"><FleetIcon name="focus" />{t("Show fleet")}</Button>
    </div>
    {!panelOpen && !editor && <Button className="absolute bottom-10 start-4 z-20 bg-surface text-foreground md:bottom-auto md:top-4 shadow-sm hover:bg-secondary" variant="outline" onClick={() => setPanelOpen(true)}><FleetIcon name="drivers" />{t("Drivers")} <span className="tabular-nums">{!snapshot ? "—" : drivers.length.toLocaleString(locale)}</span></Button>}
    {panelOpen && !editor && <DriverPanel drivers={drivers} now={fleet.now} freshnessSeconds={freshSeconds} selectedId={selectedId} loading={fleet.loading} available={Boolean(snapshot)} connected={connected} onSelect={selectDriver} onCollapse={() => setPanelOpen(false)} />}
    {!editor && <Button ref={editButton} variant="outline" disabled={!snapshot} onClick={editHeadquarters} className={`absolute end-4 top-[68px] z-10 bg-surface shadow-sm md:bottom-10 md:top-auto ${selected ? "hidden" : ""}`}><FleetIcon name="building" />{snapshot?.headquarters ? t("Edit company headquarters") : t("Set company headquarters")}</Button>}
    {fleet.error && (!snapshot || connected) && <div className="absolute end-4 top-28 z-20 max-w-[calc(100%-2rem)] rounded-lg border border-danger-border bg-surface p-4 shadow-sm md:max-w-xs" role="alert"><p className="text-sm text-destructive">{t(fleet.error === "unavailable" ? "Fleet tracking is temporarily unavailable. Please try again." : fleet.error === "access" ? "Your company access changed. Reload the page to continue." : "Live updates are disconnected. Showing the latest locations.")}</p><Button variant="outline" size="sm" className="mt-3" onClick={fleet.retry}>{t("Retry")}</Button></div>}
    {fleet.connection === "disconnected" && snapshot && <Button variant="outline" size="sm" onClick={fleet.retry} className="absolute end-4 top-[68px] z-20 bg-surface">{t("Reconnect")}</Button>}
    {selected && !editor && <DriverDetails driver={selected} now={fleet.now} freshnessSeconds={freshSeconds} connected={connected} following={activeFollow} onFollow={() => { setFollowing(!activeFollow); setFocusRequest(value => value + 1); }} onClose={() => { setSelectedId(null); setFollowing(false); }} />}
    {editor && <HeadquartersEditor initial={draft} address={editor.address} onCoordinate={setDraft} onFocusLocation={coordinate => { setDraft(coordinate); setDraftFocusRequest(value => value + 1); }} onCancel={closeEditor} onSave={async coordinate => {
      const result = await fleet.saveHeadquarters({ ...coordinate, expectedRevision: editor.expectedRevision });
      if (result.status === "headquarters") { closeEditor(); setNotice(t("Location saved.")); setFitRequest(value => value + 1); return null; }
      if (result.status === "conflict") return t("Headquarters changed in another session. Cancel and retry after refreshing the data.");
      if (result.status === "invalid") return t("Check the location coordinates and address, then try again.");
      if (result.status === "uncertain") return t("Could not confirm the save. Reload the data to verify the location before trying again.");
      return t("Could not save headquarters. Check your connection and session, then try again.");
    }} />}
    {notice && <p role="status" className="absolute bottom-10 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-success-border bg-surface px-5 py-3 text-sm text-success shadow-sm">{notice}</p>}
  </div>;
}
