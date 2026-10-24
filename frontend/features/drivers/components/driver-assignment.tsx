"use client";
import { useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VehicleBrandLogo } from "@/components/vehicles/vehicle-brand-logo";
import { vehicleTypeTranslationKey } from "@/components/vehicles/vehicle-brands";
import { withSessionLock } from "@/lib/auth/session-lock";
import { fleetAction } from "@/features/vehicles/vehicles.action";
import { useVehicles } from "@/features/vehicles/use-vehicles";
import {
  fleetMessages,
  type FleetResult,
  type Vehicle,
} from "@/features/vehicles/vehicles.types";
import type { Driver, DriverScope } from "../drivers.types";
import { useLocale } from "@/lib/i18n";
export function DriverAssignment({
  driver,
  scope,
  onSaved,
  onPending,
}: {
  driver: Driver;
  scope: DriverScope;
  onSaved: () => void;
  onPending: (value: boolean) => void;
}) {
  const { t } = useLocale();
  const [choosing, setChoosing] = useState(false);
  const [choice, setChoice] = useState<Vehicle | null | undefined>(undefined);
  const [result, setResult] = useState<FleetResult | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function save() {
    if (busy.current || choice === undefined || result?.status === "uncertain")
      return;
    busy.current = true;
    setPending(true);
    onPending(true);
    setResult(null);
    try {
      const next = await withSessionLock(() =>
        fleetAction(scope, {
          kind: "assign",
          id: driver.id,
          vehicleId: choice?.id ?? null,
          expectedVehicleId: driver.vehicle?.id ?? null,
        }),
      );
      if (!active.current) return;
      if (next.status === "saved") {
        setChoosing(false);
        setChoice(undefined);
        onSaved();
      } else setResult(next);
    } catch (error) {
      unstable_rethrow(error);
      if (active.current) setResult({ status: "uncertain" });
    } finally {
      busy.current = false;
      if (active.current) {
        setPending(false);
        onPending(false);
      }
    }
  }
  return (
    <div className="mt-4 space-y-4">
      {!choosing && choice === undefined && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setResult(null);
              setChoosing(true);
            }}
          >
            {driver.vehicle ? t("Change vehicle") : t("Assign vehicle")}
          </Button>
          {driver.vehicle && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setResult(null);
                setChoice(null);
              }}
            >
              {t("Unassign vehicle")}
            </Button>
          )}
        </div>
      )}
      {choosing && choice === undefined && (
        <VehiclePicker
          scope={scope}
          onSelect={(vehicle) => {
            setChoice(vehicle);
            setChoosing(false);
          }}
          onCancel={() => setChoosing(false)}
        />
      )}
      {choice !== undefined && (
        <section
          aria-label={t("Confirm vehicle assignment")}
          className="rounded-md border border-border-strong bg-surface p-4"
        >
          <h4 className="text-sm font-semibold">
            {choice === null
              ? t("Unassign this vehicle?")
              : driver.vehicle
                ? t("Replace the assigned vehicle?")
                : t("Assign this vehicle?")}
          </h4>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {choice === null
              ? t("{name} will have no vehicle assigned.", { name: driver.name })
              : driver.vehicle
                ? t("Release {currentPlate} and assign {newPlate} to {name}.", { currentPlate: driver.vehicle.plateNumber, newPlate: choice.plateNumber, name: driver.name })
                : t("Assign {plate} to {name}.", { plate: choice.plateNumber, name: driver.name })}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={
                pending ||
                result?.status === "uncertain" ||
                result?.status === "conflict"
              }
              onClick={() => void save()}
            >
              {pending
                ? t("Saving...")
                : choice === null
                  ? t("Confirm unassignment")
                  : t("Confirm assignment")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setChoice(undefined);
                setResult(null);
              }}
            >
              {t("Cancel")}
            </Button>
          </div>
        </section>
      )}
      {result && result.status !== "saved" && result.status !== "list" && (
        <div
          role="alert"
          className="rounded-md border border-danger/25 bg-danger-subtle p-3 text-sm"
        >
          <p>{t(fleetMessages[result.status])}</p>
          {result.status === "conflict" && (
            <Button
              className="mt-3"
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setChoice(undefined);
                setChoosing(false);
                setResult(null);
                onSaved();
              }}
            >
              {t("Refresh driver")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
function VehiclePicker({
  scope,
  onSelect,
  onCancel,
}: {
  scope: DriverScope;
  onSelect: (vehicle: Vehicle) => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { result, retry } = useVehicles(scope, search, page, true);
  const data = result?.status === "list" ? result.data : null;
  return (
    <section
      aria-label={t("Available company vehicles")}
      className="rounded-md border border-border bg-surface p-4"
    >
      <form
        className="flex flex-wrap items-end gap-2"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(
            String(
              new FormData(event.currentTarget).get("search") ?? "",
            ).trim(),
          );
        }}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="assignment-search">{t("Search available vehicles")}</Label>
          <Input
            autoFocus
            id="assignment-search"
            name="search"
            type="search"
            maxLength={100}
            placeholder={t("Manufacturer, model or plate")}
          />
        </div>
        <Button type="submit" size="sm">
          {t("Search")}
        </Button>
      </form>
      {!result ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {t("Loading available vehicles...")}
        </p>
      ) : !data ? (
        <div role="alert" className="mt-4 text-sm">
          {result.status !== "saved" &&
            result.status !== "list" &&
            t(fleetMessages[result.status])}
          {result.status === "unavailable" && (
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {t("Try again")}
            </Button>
          )}
        </div>
      ) : (
        <>
          {data.items.length === 0 ? (
            <div className="mt-5 text-sm">
              <p>{t("No unassigned vehicles found.")}</p>
              <Link
                href="/app/vehicles"
                className="mt-2 inline-block text-accent-foreground underline"
              >
                {t("Manage company vehicles")}
              </Link>
            </div>
          ) : (
            <ul aria-label={t("Available vehicles")} className="mt-4 space-y-2">
              {data.items.map((vehicle) => (
                <li key={vehicle.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(vehicle)}
                    className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-start hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <VehicleBrandLogo
                      manufacturer={vehicle.manufacturer}
                      type={vehicle.type}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold [overflow-wrap:anywhere]">
                        {[vehicle.manufacturer, vehicle.model]
                          .filter(Boolean)
                          .join(" ") || t(vehicleTypeTranslationKey(vehicle.type))}
                      </span>
                      <bdi className="mt-1 block font-mono text-xs [overflow-wrap:anywhere]">
                        {vehicle.plateNumber.trim() || t("Plate not recorded")}
                      </bdi>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <nav
            aria-label={t("Available vehicle pagination")}
            className="mt-4 flex items-center justify-between gap-2"
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((v) => v - 1)}
            >
              {t("Previous vehicles")}
            </Button>
            <span className="text-xs">{t("Page {page}", { page })}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!data.hasNext}
              onClick={() => setPage((v) => v + 1)}
            >
              {t("Next vehicles")}
            </Button>
          </nav>
        </>
      )}
      <Button
        className="mt-4"
        type="button"
        size="sm"
        variant="ghost"
        onClick={onCancel}
      >
        {t("Cancel selection")}
      </Button>
    </section>
  );
}
