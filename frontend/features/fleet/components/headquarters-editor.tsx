"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/lib/i18n";
import { FleetIcon } from "./fleet-icons";
import type { MapCoordinate } from "./fleet-map";
import styles from "./fleet-map.module.css";

export function HeadquartersEditor({ initial, address, onCoordinate, onFocusLocation, onSave, onCancel }: { initial: MapCoordinate | null; address: string; onCoordinate: (coordinate: MapCoordinate | null) => void; onFocusLocation: (coordinate: MapCoordinate) => void; onSave: (coordinate: MapCoordinate & { address: string }) => Promise<string | null>; onCancel: () => void }) {
  const { t } = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false);
  const [latitude, setLatitude] = useState(initial ? String(initial.latitude) : "");
  const [longitude, setLongitude] = useState(initial ? String(initial.longitude) : "");
  const [addressValue, setAddress] = useState(address);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousCoordinate, setPreviousCoordinate] = useState(initial);
  if (initial !== previousCoordinate) {
    setPreviousCoordinate(initial);
    if (initial && (Number(latitude) !== initial.latitude || Number(longitude) !== initial.longitude)) { setLatitude(String(initial.latitude)); setLongitude(String(initial.longitude)); }
  }
  const lat = Number(latitude), lng = Number(longitude);
  const valid = latitude.trim() !== "" && longitude.trim() !== "" && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  useEffect(() => {
    mounted.current = true;
    dialog.current?.show();
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => { mounted.current = false; };
  }, []);
  // A nonmodal native dialog keeps map selection available; Escape and focus return remain explicit.
  function updateCoordinate(nextLatitude: string, nextLongitude: string) {
    setLatitude(nextLatitude); setLongitude(nextLongitude); setError(null);
    const nextLat = Number(nextLatitude), nextLng = Number(nextLongitude);
    onCoordinate(nextLatitude.trim() && nextLongitude.trim() && Number.isFinite(nextLat) && Number.isFinite(nextLng) && Math.abs(nextLat) <= 90 && Math.abs(nextLng) <= 180 ? { latitude: nextLat, longitude: nextLng } : null);
  }
  function useCurrentLocation() {
    setError(null);
    if (!window.isSecureContext) {
      setError(t("Location access requires a secure connection (HTTPS or localhost)."));
      return;
    }
    if (!navigator.geolocation) {
      setError(t("This browser does not support location services. Enter coordinates or select a point on the map."));
      return;
    }

    setLocating(true);
    try {
      navigator.geolocation.getCurrentPosition(position => {
        if (!mounted.current) return;
        const coordinate = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        if (!Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude) || coordinate.latitude < -90 || coordinate.latitude > 90 || coordinate.longitude < -180 || coordinate.longitude > 180) {
          setError(t("The browser could not read a valid location. Please try again."));
          setLocating(false);
          return;
        }
        updateCoordinate(String(coordinate.latitude), String(coordinate.longitude));
        onFocusLocation(coordinate);
        setLocating(false);
      }, locationError => {
        if (!mounted.current) return;
        const message = locationError.code === 1
          ? t("Allow location access in your browser's site permissions, then try again.")
          : locationError.code === 2
            ? t("Your current location is unavailable. Check your device settings and try again.")
            : locationError.code === 3
              ? t("The location request timed out. Try again or adjust the marker on the map.")
              : t("The browser could not read a valid location. Please try again.");
        setError(message);
        setLocating(false);
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
    } catch {
      if (mounted.current) {
        setError(t("Location access requires a secure connection (HTTPS or localhost)."));
        setLocating(false);
      }
    }
  }

  return <dialog ref={dialog} className={styles.editor} aria-labelledby="headquarters-title" aria-describedby="headquarters-description" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }} onKeyDown={event => { if (event.key === "Escape" && !busy) onCancel(); }}>
    <form onSubmit={async event => {
      event.preventDefault();
      if (!valid || busy || locating) { setError(t("Enter valid headquarters coordinates.")); return; }
      setBusy(true);
      setError(null);
      try {
        const message = await onSave({ latitude: lat, longitude: lng, address: addressValue.trim() });
        if (!mounted.current) return;
        if (message) setError(message);
      } catch {
        if (mounted.current) setError(t("Could not save headquarters. Check your connection and session, then try again."));
      } finally {
        if (mounted.current) setBusy(false);
      }
    }} aria-busy={busy || locating}>
      <div className="flex items-start justify-between border-b p-4"><div><h2 id="headquarters-title" className="flex items-center gap-2 text-base font-semibold"><FleetIcon name="building" className="size-5 text-primary-hover" />{t("Set company headquarters title")}</h2><p id="headquarters-description" className="mt-2 text-sm leading-6 text-muted-foreground">{t("Choose the location on the map or enter coordinates below. You can drag the marker to adjust its position.")}</p></div><Button type="button" size="icon" variant="ghost" aria-label={t("Close headquarters editor")} disabled={busy} onClick={onCancel}><FleetIcon name="close" /></Button></div>
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <Button type="button" variant="outline" className="min-h-11 w-full" disabled={locating || busy} onClick={useCurrentLocation}>
            <FleetIcon name="focus" />{locating ? t("Getting your location...") : t("Use my current location")}
          </Button>
          <p className="text-xs leading-5 text-muted-foreground">{t("Your computer's location may be approximate. Adjust the marker on the map if needed.")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-2 text-xs font-medium"><span>{t("Latitude")}</span><Input type="number" dir="ltr" step="0.0000001" min={-90} max={90} required value={latitude} onChange={event => updateCoordinate(event.target.value, longitude)} placeholder="31.90" disabled={busy || locating} /></label>
          <label className="space-y-2 text-xs font-medium"><span>{t("Longitude")}</span><Input type="number" dir="ltr" step="0.0000001" min={-180} max={180} required value={longitude} onChange={event => updateCoordinate(latitude, event.target.value)} placeholder="35.20" disabled={busy || locating} /></label>
        </div>
        <label className="block space-y-2 text-xs font-medium"><span>{t("Address")} <span className="font-normal text-muted-foreground">({t("Optional")})</span></span><Input value={addressValue} onChange={event => setAddress(event.target.value)} maxLength={300} placeholder={t("Address, street, building")} disabled={busy || locating} /></label>
        {error && <p role="alert" aria-live="assertive" className="rounded-md bg-danger-background p-3 text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex gap-2 border-t bg-secondary p-4"><Button type="submit" className="min-h-11 flex-1" disabled={!valid || busy || locating}>{busy ? t("Saving location...") : t("Save location")}</Button><Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={onCancel}>{t("Cancel")}</Button></div>
    </form>
  </dialog>;
}
