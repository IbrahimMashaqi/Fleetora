"use client";
import { useCallback } from "react";
import { Combobox } from "@/components/ui/combobox";
import { useLocale } from "@/lib/i18n";
import { catalogKey } from "../vehicle-catalog";
type Option = { value: string; label: string; keywords?: readonly string[] };
/** Bundled public brands/models are catalogue data, not tenant records. */
export function SearchableSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useLocale();
  const search = useCallback(
    async (query: string) =>
      options.filter((option) =>
        [option.label, ...(option.keywords ?? [])].some((term) =>
          catalogKey(term).includes(catalogKey(query)),
        ),
      ),
    [options],
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
