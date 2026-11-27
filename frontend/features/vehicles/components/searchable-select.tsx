"use client";
import { useCallback } from "react";
import { Combobox } from "@/components/ui/combobox";
import { useLocale } from "@/lib/i18n";
import { readClient } from "@/lib/api/read.client";
import type { FleetScope } from "../vehicles.types";
type Option = { value: string; label: string; keywords?: readonly string[] };
/** Bundled public brands/models are catalogue data, not tenant records. */
export function SearchableSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
  scope,
  kind,
  manufacturer,
}: {
  id: string;
  label: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  onChange: (value: string) => void;
  scope: FleetScope;
  kind: "vehicleBrands" | "vehicleModels";
  manufacturer?: string;
}) {
  const { t } = useLocale();
  const search = useCallback(
    async (search: string) => {
      const result = await readClient("operations", scope, {
        resource: "lookups",
        query: { kind, search, ...(manufacturer ? { manufacturer } : {}) },
      });
      if (result.status !== "ready" || result.data.kind !== "lookups")
        throw new Error("Catalog unavailable");
      return result.data.items.map((row) => ({
        value: row.id,
        label:
          options.find((option) => option.value === row.id)?.label ?? row.label,
      }));
    },
    [scope, kind, manufacturer, options],
  );
  return (
    <Combobox
      id={id}
      label={label}
      placeholder={t("Search")}
      value={options.find((option) => option.value === value) ?? null}
      onChange={(option) => onChange(option?.value ?? "")}
      search={search}
      disabled={disabled}
    />
  );
}
