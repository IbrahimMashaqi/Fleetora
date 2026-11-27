"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { withSessionLock } from "@/lib/auth/session-lock";
import { fleetAction } from "@/features/vehicles/vehicles.action";
import { readClient } from "@/lib/api/read.client";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
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
  const [choice, setChoice] = useState<Pick<Vehicle, "id" | "plateNumber"> | null | undefined>(undefined);
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
  onSelect: (vehicle: Pick<Vehicle, "id" | "plateNumber">) => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const [value, setValue] = useState<ComboboxOption | null>(null);
  const search = useCallback(async (text: string) => {
    const result = await readClient("operations", scope, { resource: "lookups", query: { kind: "vehicles", search: text } });
    if (result.status !== "ready" || result.data.kind !== "lookups") throw new Error("Vehicle lookup unavailable");
    return result.data.items.map(vehicle => ({ value: vehicle.id, label: vehicle.label.trim() || vehicle.detail, detail: vehicle.detail }));
  }, [scope]);
  return <section aria-label={t("Available company vehicles")} className="space-y-3 rounded-md border border-border bg-surface p-4">
    <Combobox id="assignment-search" label={t("Search available vehicles")} placeholder={t("Manufacturer, model or plate")} value={value} search={search}
      onChange={option => { setValue(option); if (option) onSelect({ id: option.value, plateNumber: option.detail ?? "" }); }} />
    <Button type="button" variant="ghost" size="sm" onClick={onCancel}>{t("Cancel selection")}</Button>
  </section>;
}
