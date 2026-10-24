"use client";
import { useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { vehicleTypeTranslationKey } from "@/components/vehicles/vehicle-brands";
import { withSessionLock } from "@/lib/auth/session-lock";
import { useLocale } from "@/lib/i18n";
import { fleetAction } from "../vehicles.action";
import {
  fleetMessages,
  type FleetScope,
  type FleetResult,
  type Vehicle,
  type VehicleInput,
} from "../vehicles.types";
import { findManufacturer, type VehicleCatalog } from "../vehicle-catalog";
import { SearchableSelect } from "./searchable-select";
import styles from "./vehicle-editor.module.css";
export function VehicleEditor({
  vehicle,
  catalog,
  scope,
  onClose,
  onSaved,
}: {
  vehicle: Vehicle | null;
  catalog: VehicleCatalog;
  scope: FleetScope;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLocale();
  const [manufacturer, setManufacturer] = useState(vehicle?.manufacturer ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [customBrand, setCustomBrand] = useState(false);
  const [customModel, setCustomModel] = useState(false);
  const brand = findManufacturer(catalog, manufacturer);
  const brandCustom = customBrand || (!!manufacturer.trim() && !brand);
  const modelCustom =
    customModel || (!!model.trim() && !brand?.models.includes(model));
  const brandValue = brandCustom
    ? "custom"
    : brand
      ? `brand:${brand.manufacturer}`
      : "none";
  const modelValue = modelCustom
    ? "custom"
    : model.trim()
      ? `model:${model}`
      : "none";
  function changeManufacturer(value: string) {
    if (value === brandValue) return;
    setCustomBrand(value === "custom");
    setManufacturer(value.startsWith("brand:") ? value.slice(6) : "");
    setModel("");
    setCustomModel(false);
  }
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(true);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<FleetResult | null>(null);
  useEffect(() => {
    active.current = true;
    dialog.current?.showModal();
    return () => {
      active.current = false;
    };
  }, []);
  async function submit(form: HTMLFormElement) {
    if (busy.current || result?.status === "uncertain") return;
    const data = new FormData(form);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    const type = text("type");
    if (
      type !== "CAR" &&
      type !== "VAN" &&
      type !== "TRUCK" &&
      type !== "MOTORCYCLE"
    ) {
      setResult({ status: "invalid" });
      return;
    }
    const input: VehicleInput = {
      manufacturer: manufacturer.trim() || null,
      model: model.trim() || null,
      type,
      plateNumber: text("plateNumber"),
    };
    busy.current = true;
    setPending(true);
    setResult(null);
    try {
      const next = await withSessionLock(() =>
        fleetAction(
          scope,
          vehicle
            ? { kind: "edit", id: vehicle.id, input }
            : { kind: "create", input },
        ),
      );
      if (!active.current) return;
      if (next.status === "saved") onSaved();
      else setResult(next);
    } catch (error) {
      unstable_rethrow(error);
      if (active.current) setResult({ status: "uncertain" });
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      aria-labelledby="vehicle-editor-title"
      className={`${styles.editor} fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-6 text-foreground shadow-lg backdrop:bg-sidebar-navy/55`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="vehicle-editor-title" className="text-lg font-semibold">
            {vehicle ? t("Edit vehicle") : t("Register vehicle")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Keep your company fleet ready for assignment.")}
          </p>
        </div>
        <Button
          autoFocus
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => dialog.current?.close()}
        >
          {t("Close")}
        </Button>
      </div>
      <form
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(event.currentTarget);
        }}
      >
        <fieldset
          disabled={pending || result?.status === "uncertain"}
          className="grid gap-5 sm:grid-cols-2"
        >
          <div className="space-y-2">
            <Label htmlFor="vehicle-manufacturer">{t("Manufacturer")}</Label>
            <SearchableSelect
              id="vehicle-manufacturer"
              label={t("Manufacturer")}
              value={brandValue}
              options={[
                { value: "none", label: t("Not recorded") },
                ...catalog.map((entry) => ({
                  value: `brand:${entry.manufacturer}`,
                  label: entry.manufacturer,
                  keywords: entry.aliases,
                })),
                { value: "custom", label: t("Other / Custom manufacturer") },
              ]}
              onChange={changeManufacturer}
            />
            {brandCustom && (
              <>
                <Label htmlFor="custom-manufacturer">{t("Custom manufacturer")}</Label>
                <Input
                  id="custom-manufacturer"
                  required
                  maxLength={80}
                  pattern={".*\\S.*"}
                  value={manufacturer}
                  onChange={(event) => {
                    setCustomBrand(true);
                    setManufacturer(event.target.value);
                    setModel("");
                    setCustomModel(false);
                  }}
                />
              </>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicle-model">{t("Model")}</Label>
            <SearchableSelect
              id="vehicle-model"
              label={t("Model")}
              value={modelValue}
              disabled={!manufacturer.trim() && !model.trim() && !customModel}
              options={[
                { value: "none", label: t("Not recorded") },
                ...(brand?.models ?? []).map((name) => ({
                  value: `model:${name}`,
                  label: name,
                })),
                { value: "custom", label: t("Other / Custom model") },
              ]}
              onChange={(value) => {
                if (value === modelValue) return;
                setCustomModel(value === "custom");
                setModel(value.startsWith("model:") ? value.slice(6) : "");
              }}
            />
            {!manufacturer.trim() && !model.trim() && !customModel && (
              <p className="text-xs text-muted-foreground">
                {t("Choose a manufacturer first.")}
              </p>
            )}
            {modelCustom && (
              <>
                <Label htmlFor="custom-model">{t("Custom model")}</Label>
                <Input
                  id="custom-model"
                  required
                  maxLength={100}
                  pattern={".*\\S.*"}
                  value={model}
                  onChange={(event) => {
                    setCustomModel(true);
                    setModel(event.target.value);
                  }}
                />
              </>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicle-type">{t("Vehicle type")}</Label>
            <select
              id="vehicle-type"
              name="type"
              defaultValue={vehicle?.type ?? "CAR"}
              className="h-10 w-full rounded-md border border-input bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
            >
              {["CAR", "MOTORCYCLE", "VAN", "TRUCK"].map((type) => (
                <option key={type} value={type}>
                  {t(vehicleTypeTranslationKey(type))}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicle-plate">{t("License plate")}</Label>
            <Input
              id="vehicle-plate"
              name="plateNumber"
              required
              maxLength={32}
              defaultValue={vehicle?.plateNumber ?? ""}
              placeholder={t("Plate number")}
            />
          </div>
        </fieldset>
        <p className="text-xs leading-5 text-muted-foreground">
          {t("Manufacturer and model are optional. Each plate must be unique within your company.")}
        </p>
        {result && result.status !== "saved" && result.status !== "list" && (
          <p
            role="alert"
            className="rounded-md border border-danger/25 bg-danger-subtle p-3 text-sm text-foreground"
          >
            {t(fleetMessages[result.status])}
          </p>
        )}
        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => dialog.current?.close()}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="submit"
            disabled={pending || result?.status === "uncertain"}
          >
            {pending
              ? t("Saving...")
              : vehicle
                ? t("Save changes")
                : t("Register vehicle")}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
