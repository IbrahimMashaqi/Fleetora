"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as LibreMap, Marker, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
import type { FleetDriver, Headquarters } from "../fleet.types";
import { useLocale } from "@/lib/i18n";
import { isDriverOnline } from "../fleet-state";
import { fleetMapStyle, OPENFREE_ROADMAP_STYLE } from "../map-configuration";
import { localizeRoadmapStyle } from "../roadmap-style";
import { fleetMapData, validMapCoordinate } from "../fleet-map-data";
import { FleetIcon } from "./fleet-icons";
import styles from "./fleet-map.module.css";

export type MapCoordinate = { latitude: number; longitude: number };
export type FleetMapProps = {
  drivers: FleetDriver[]; headquarters: Headquarters | null; companyName: string;
  now: number; freshnessSeconds: number; connected: boolean; preview?: boolean;
  selectedId?: string | null; follow?: boolean; fitRequest?: number;
  focusRequest?: number; editing?: boolean; draft?: MapCoordinate | null;
  draftFocusRequest?: number;
  onAvailabilityChange?: (available: boolean) => void;
  onHeadquartersPopupChange?: (open: boolean) => void;
  onSelect?: (id: string) => void; onManualMove?: () => void;
  onCoordinate?: (coordinate: MapCoordinate) => void; onEditHeadquarters?: () => void;
  onPreviewClick?: () => void;
};

const motionDuration = (duration: number) => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : duration;

const building = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5l8-2v18M12 9h8v12M2 21h20M7 8h2m-2 4h2m-2 4h2m6-3h2m-2 4h2"/></svg>';

function mapImage(text: string, color: string, arrow = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 80; canvas.height = 80;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.fillStyle = color;
  if (arrow) { context.beginPath(); context.moveTo(40, 8); context.lineTo(53, 34); context.lineTo(40, 29); context.lineTo(27, 34); context.closePath(); context.fill(); }
  else { context.beginPath(); context.arc(40, 40, 33, 0, Math.PI * 2); context.fill(); context.fillStyle = "white"; context.font = "600 25px sans-serif"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(text, 40, 41); }
  return context.getImageData(0, 0, 80, 80);
}

export default function FleetMap(props: FleetMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const latest = useRef(props);
  const lastPositions = useRef(new Map<string, [number, number]>());
  const markerUpdater = useRef<(() => void) | null>(null);
  const lastFocusRequest = useRef(0);
  const lastDraftFocusRequest = useRef(0);
  const lastFitRequest = useRef(0);
  const headquartersFramed = useRef(false);
  const [ready, setReady] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState(false);
  const [busy, setBusy] = useState(true);
  const { locale, t } = useLocale();
  useEffect(() => { latest.current = props; });

  useEffect(() => {
    let disposed = false;
    let providerFailed = false;
    let resize: ResizeObserver | undefined;
    let headquartersMarker: Marker | undefined;
    let draftMarker: Marker | undefined;
    const style = fleetMapStyle(locale);
    if (!style || !host.current) return;
    void import("maplibre-gl").then((libre) => {
      if (disposed || !host.current) return;
      const tokens = getComputedStyle(host.current);
      const primary = tokens.getPropertyValue("--primary-hover").trim();
      const muted = tokens.getPropertyValue("--muted-foreground").trim();
      // MapLibre 6 ships a separate module worker. Let Next emit it as a local asset.
      libre.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
      const map = new libre.Map({ container: host.current, center: [35.15, 31.85], zoom: 7.7, attributionControl: false, maxZoom: 19, renderWorldCopies: false, locale: locale === "ar"
        ? { "NavigationControl.ZoomIn": t("Zoom in"), "NavigationControl.ZoomOut": t("Zoom out"), "NavigationControl.ResetBearing": t("Reset map bearing"), "FullscreenControl.Enter": t("Enter fullscreen"), "FullscreenControl.Exit": t("Exit fullscreen") }
        : { "NavigationControl.ZoomIn": t("Zoom in"), "NavigationControl.ZoomOut": t("Zoom out"), "NavigationControl.ResetBearing": t("Reset map bearing"), "FullscreenControl.Enter": t("Enter fullscreen"), "FullscreenControl.Exit": t("Exit fullscreen") } });
      mapRef.current = map;
      map.addControl(new libre.AttributionControl({ compact: false }), "bottom-left");
      if (latest.current.preview) { map.scrollZoom.disable(); map.dragRotate.disable(); map.touchZoomRotate.disableRotation(); }
      else { map.addControl(new libre.NavigationControl({ showCompass: true }), "top-left"); map.addControl(new libre.FullscreenControl(), "top-left"); }
      map.getCanvas().setAttribute("aria-label", t("Use arrow keys to navigate the fleet map and plus/minus to zoom"));
      map.on("error", () => { if (!disposed) { providerFailed = true; setFailure(true); setBusy(false); latest.current.onAvailabilityChange?.(false); } });
      map.on("styleimagemissing", (event) => {
        if (event.id.startsWith("cluster-") && !map.hasImage(event.id)) map.addImage(event.id, mapImage(event.id.slice(8), primary), { pixelRatio: 2 });
      });
      map.on("load", () => {
        if (disposed) return;
        // MapLibre can finish loading after failed tile requests. Keep the
        // provider failure visible instead of reporting that blank map as ready.
        setBusy(false); setFailure(providerFailed); latest.current.onAvailabilityChange?.(!providerFailed);
        map.addSource("fleet", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 46, clusterMaxZoom: 14 });
        map.addImage("heading-live", mapImage("", primary, true), { pixelRatio: 2 });
        map.addImage("heading-stale", mapImage("", muted, true), { pixelRatio: 2 });
        map.addLayer({ id: "clusters", type: "symbol", source: "fleet", filter: ["has", "point_count"], layout: { "icon-image": ["concat", "cluster-", ["to-string", ["get", "point_count"]]], "icon-allow-overlap": true } });
        map.addLayer({ id: "driver-selection", type: "circle", source: "fleet", filter: ["!", ["has", "point_count"]], paint: { "circle-radius": ["case", ["get", "selected"], 18, 13], "circle-color": "white", "circle-stroke-width": ["case", ["get", "selected"], 3, 0], "circle-stroke-color": primary } });
        map.addLayer({ id: "drivers", type: "circle", source: "fleet", filter: ["!", ["has", "point_count"]], paint: { "circle-radius": 9, "circle-color": ["case", ["get", "online"], primary, muted], "circle-stroke-color": "white", "circle-stroke-width": 2 } });
        map.addLayer({ id: "heading", type: "symbol", source: "fleet", filter: ["all", ["!", ["has", "point_count"]], ["get", "hasHeading"]], layout: { "icon-image": ["case", ["get", "online"], "heading-live", "heading-stale"], "icon-rotate": ["get", "heading"], "icon-rotation-alignment": "map", "icon-allow-overlap": true } });
        map.on("click", "clusters", async event => {
          const feature = event.features?.[0];
          if (!feature || feature.geometry.type !== "Point") return;
          const source = map.getSource("fleet") as GeoJSONSource;
          const zoom = await source.getClusterExpansionZoom(Number(feature.properties?.cluster_id));
          if (!disposed) map.easeTo({ center: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]], zoom, duration: motionDuration(450) });
        });
        map.on("click", "drivers", event => { if (!latest.current.editing && event.features?.[0]?.properties?.id) latest.current.onSelect?.(String(event.features[0].properties.id)); });
        for (const layer of ["clusters", "drivers"]) { map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; }); }
        const manualMove = (event: { originalEvent?: Event }) => { if (event.originalEvent) latest.current.onManualMove?.(); };
        map.on("dragstart", manualMove); map.on("zoomstart", manualMove); map.on("rotatestart", manualMove);
        map.on("click", (event: MapMouseEvent) => {
          if (latest.current.editing) {
            latest.current.onCoordinate?.({ latitude: Number(event.lngLat.lat.toFixed(7)), longitude: Number(event.lngLat.lng.toFixed(7)) });
          } else if (latest.current.preview) {
            latest.current.onPreviewClick?.();
          }
        });
        const updateMarkers = () => {
          const current = latest.current;
          headquartersMarker?.remove(); draftMarker?.remove();
          headquartersMarker = undefined; draftMarker = undefined;
          if (current.headquarters) {
            const hq = current.headquarters;
            const element = document.createElement("button"); element.type = "button"; element.className = styles.headquarters; element.innerHTML = building; element.setAttribute("aria-label", t("Headquarters for {company}", { company: current.companyName }));
            const popup = document.createElement("div"); popup.className = styles.popup; popup.dir = locale === "ar" ? "rtl" : "ltr";
            const title = document.createElement("strong"); title.textContent = current.companyName; popup.append(title);
            const address = document.createElement("p"); address.textContent = hq.address || t("Company headquarters"); popup.append(address);
            const coordinate = document.createElement("p"); coordinate.dir = "ltr"; coordinate.textContent = `${hq.latitude.toFixed(5)}, ${hq.longitude.toFixed(5)}`; popup.append(coordinate);
            const center = document.createElement("button"); center.type = "button"; center.textContent = t("Focus on headquarters"); center.onclick = () => map.easeTo({ center: [hq.longitude, hq.latitude], zoom: 13, duration: motionDuration(400) }); popup.append(center);
            if (current.onEditHeadquarters) { const edit = document.createElement("button"); edit.type = "button"; edit.textContent = t("Edit headquarters"); edit.style.marginInlineStart = "16px"; edit.onclick = () => latest.current.onEditHeadquarters?.(); popup.append(edit); }
            const information = new libre.Popup({ offset: 25, closeButton: false }).setDOMContent(popup);
            information.on("open", () => latest.current.onHeadquartersPopupChange?.(true));
            information.on("close", () => latest.current.onHeadquartersPopupChange?.(false));
            headquartersMarker = new libre.Marker({ element }).setLngLat([hq.longitude, hq.latitude]).setPopup(information).addTo(map);
          }
          if (current.editing && current.draft) {
            const element = document.createElement("div"); element.className = `${styles.headquarters} ${styles.temporary}`; element.innerHTML = building; element.setAttribute("aria-label", t("Suggested headquarters location — drag to adjust"));
            draftMarker = new libre.Marker({ element, draggable: true }).setLngLat([current.draft.longitude, current.draft.latitude]).addTo(map);
            draftMarker.on("dragend", () => { if (draftMarker) { const lngLat = draftMarker.getLngLat(); latest.current.onCoordinate?.({ latitude: Number(lngLat.lat.toFixed(7)), longitude: Number(lngLat.lng.toFixed(7)) }); } });
          }
        };
        markerUpdater.current = updateMarkers;
        if (latest.current.headquarters) { map.jumpTo({ center: [latest.current.headquarters.longitude, latest.current.headquarters.latitude], zoom: latest.current.preview ? 10 : 11 }); headquartersFramed.current = true; }
        setReady(value => value + 1);
      });
      map.setStyle(style, {
        transformStyle: (_previous, next) => style === OPENFREE_ROADMAP_STYLE ? localizeRoadmapStyle(next, locale) : next,
      });
      resize = new ResizeObserver(() => map.resize()); resize.observe(host.current);
    }).catch(() => { if (!disposed) { setFailure(true); setBusy(false); } });
    return () => { disposed = true; resize?.disconnect(); markerUpdater.current = null; headquartersMarker?.remove(); draftMarker?.remove(); mapRef.current?.remove(); mapRef.current = null; headquartersFramed.current = false; };
  }, [attempt, locale, t]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getSource("fleet")) return;
    const source = map.getSource("fleet") as GeoJSONSource;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = props.drivers.filter(driver => driver.tracking.location && validMapCoordinate(driver.tracking.location.latitude, driver.tracking.location.longitude));
    const starting = new Map(lastPositions.current);
    const shouldAnimate = !reduced && targets.some(driver => {
      const location = driver.tracking.location!;
      const previous = starting.get(driver.id);
      const distance = previous ? Math.hypot(previous[0] - location.longitude, previous[1] - location.latitude) : 0;
      return distance > 0 && distance < 0.02 && isDriverOnline(driver, props.now, props.freshnessSeconds);
    });
    const started = performance.now();
    let frame = 0;
    const draw = (time: number) => {
      const progress = shouldAnimate ? Math.min(1, (time - started) / 650) : 1;
      for (const driver of targets) {
        const location = driver.tracking.location!;
        const target: [number, number] = [location.longitude, location.latitude];
        const previous = starting.get(driver.id);
        const animate = previous && Math.hypot(previous[0] - target[0], previous[1] - target[1]) < 0.02 && isDriverOnline(driver, props.now, props.freshnessSeconds);
        const coordinates: [number, number] = animate ? [previous[0] + (target[0] - previous[0]) * progress, previous[1] + (target[1] - previous[1]) * progress] : target;
        lastPositions.current.set(driver.id, coordinates);
      }
      source.setData(fleetMapData(props.drivers, { now: props.now, freshnessSeconds: props.freshnessSeconds, connected: props.connected, selectedId: props.selectedId, positions: lastPositions.current }));
      if (progress < 1) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [props.drivers, props.selectedId, props.now, props.freshnessSeconds, props.connected, ready]);

  useEffect(() => { if (ready) { markerUpdater.current?.(); if (!headquartersFramed.current && props.headquarters) { mapRef.current?.jumpTo({ center: [props.headquarters.longitude, props.headquarters.latitude], zoom: props.preview ? 10 : 11 }); headquartersFramed.current = true; } } }, [props.headquarters, props.editing, props.draft, props.preview, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !props.editing || !props.draft || !props.draftFocusRequest || props.draftFocusRequest === lastDraftFocusRequest.current) return;
    lastDraftFocusRequest.current = props.draftFocusRequest;
    map.easeTo({
      center: [props.draft.longitude, props.draft.latitude],
      zoom: Math.max(map.getZoom(), 14),
      duration: motionDuration(450),
    });
  }, [props.draft, props.draftFocusRequest, props.editing, ready]);
  useEffect(() => {
    const map = mapRef.current;
    const driver = props.drivers.find(item => item.id === props.selectedId);
    if (!map || !ready || !driver?.tracking.location) return;
    if (!props.follow && (!props.focusRequest || props.focusRequest === lastFocusRequest.current)) return;
    lastFocusRequest.current = props.focusRequest ?? 0;
    const location = driver.tracking.location;
    map.easeTo({ center: [location.longitude, location.latitude], zoom: Math.max(map.getZoom(), 13), duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600, padding: !props.preview && window.innerWidth >= 768 ? { right: locale === "en" ? 360 : 60, left: locale === "ar" ? 360 : 60, top: 60, bottom: 60 } : { right: 30, left: 30, top: 40, bottom: 180 } });
  }, [props.focusRequest, props.follow, props.drivers, props.selectedId, props.preview, ready, locale]);
  useEffect(() => {
    if (!props.fitRequest || props.fitRequest === lastFitRequest.current || !mapRef.current || !ready) return;
    lastFitRequest.current = props.fitRequest;
    const coordinates = props.drivers.flatMap(driver => driver.tracking.location ? [[driver.tracking.location.longitude, driver.tracking.location.latitude]] : []);
    if (props.headquarters) coordinates.push([props.headquarters.longitude, props.headquarters.latitude]);
    if (!coordinates.length) { mapRef.current.easeTo({ center: [35.15, 31.85], zoom: 7.7, duration: motionDuration(400) }); return; }
    const lng = coordinates.map(point => point[0]), lat = coordinates.map(point => point[1]);
    mapRef.current.fitBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]], { maxZoom: 13, padding: window.innerWidth >= 768 && props.selectedId ? { right: locale === "en" ? 360 : 60, left: locale === "ar" ? 360 : 60, top: 100, bottom: 70 } : 65, duration: motionDuration(500) });
  }, [props.fitRequest, props.drivers, props.headquarters, props.selectedId, ready, locale]);

  const configured = fleetMapStyle(locale) !== null;
  return <>
    <div ref={host} className={styles.canvas} dir="ltr" data-testid="fleet-map" />
    {busy && configured && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-background/70"><p className="rounded-lg border bg-surface px-5 py-3 text-sm text-muted-foreground">{t("Loading map...")}</p></div>}
    {(failure || !configured) && <div className={`absolute inset-0 grid place-items-center bg-surface-secondary px-5 ${props.preview ? "" : "pb-48 md:pb-0"}`}><div className="max-w-xs text-center" role="alert"><FleetIcon className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-semibold">{t("Map is unavailable right now")}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{configured ? t("The map could not be loaded. You can still view drivers and manage headquarters.") : t("The map is waiting for service configuration. You can view drivers and enter headquarters coordinates manually.")}</p>{configured && <Button variant="outline" className="mt-4" onClick={() => { setFailure(false); setBusy(true); setAttempt(value => value + 1); }}>{t("Reload map")}</Button>}</div></div>}
  </>;
}
