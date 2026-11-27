"use client";
import { useCallback, useEffect, useId, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { withSessionLock } from "@/lib/auth/session-lock";
import { operationsAction } from "../operations.action";
import type { Scope } from "../operations-contract";

type Props = {
  scope: Scope;
  kind: "merchants" | "drivers" | "zones" | "cities" | "warehouses" | "parcels";
  name: string;
  label: TranslationKey;
  placeholder: TranslationKey;
  initialValue?: string;
  initialLabel?: string;
  required?: boolean;
  query?: Record<string, string>;
  onChange?: (id: string) => void;
};
export function EntityCombobox(props: Props) {
  // Remount all local state across identity, company, field or eligibility changes.
  return (
    <ScopedEntityCombobox
      key={JSON.stringify([
        props.scope,
        props.kind,
        props.name,
        props.initialValue,
        props.query,
      ])}
      {...props}
    />
  );
}
function ScopedEntityCombobox({
  scope,
  kind,
  name,
  label,
  placeholder,
  initialValue = "",
  initialLabel,
  required,
  query = {},
  onChange,
}: Props) {
  const { t } = useLocale();
  const id = useId();
  const [selected, setSelected] = useState<ComboboxOption | null>(
    initialValue && initialLabel
      ? { value: initialValue, label: initialLabel }
      : null,
  );
  const [unresolved, setUnresolved] = useState(
    Boolean(initialValue && !initialLabel),
  );
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const queryKey = new URLSearchParams(query).toString();
  const load = useCallback(
    async (search: string, selectedId?: string) => {
      const result = await withSessionLock(() =>
        operationsAction(scope, {
          resource: "lookups",
          query: {
            ...Object.fromEntries(new URLSearchParams(queryKey)),
            kind,
            search,
            ...(selectedId ? { selected: selectedId } : {}),
          },
        }),
      );
      if (result.status !== "ready" || result.data.kind !== "lookups")
        throw new Error("Lookup unavailable");
      const option = (row: {
        id: string;
        label: string;
        detail: string;
      }): ComboboxOption => ({
        value: row.id,
        label: row.label,
        detail: row.detail,
      });
      return {
        items: result.data.items.map(option),
        selected: result.data.selected ? option(result.data.selected) : null,
      };
    },
    [scope, kind, queryKey],
  );
  useEffect(() => {
    if (!initialValue || initialLabel) return;
    let active = true;
    void load("", initialValue)
      .then((result) => {
        if (active) {
          setSelected(result.selected);
          setUnresolved(false);
          setFailed(false);
        }
      })
      .catch((error) => {
        unstable_rethrow(error);
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [initialValue, initialLabel, load, attempt]);
  const search = useCallback(
    async (text: string) => (await load(text)).items,
    [load],
  );
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{t(label)}</Label>
      <Combobox
        id={id}
        name={name}
        label={t(label)}
        placeholder={t(placeholder)}
        value={selected}
        onChange={(option) => {
          setSelected(option);
          onChange?.(option?.value ?? "");
        }}
        search={search}
        required={required}
        disabled={unresolved}
      />
      {failed && (
        <div role="alert" className="text-sm text-danger-foreground">
          {t("Operations are temporarily unavailable. Try again.")}{" "}
          <Button
            variant="ghost"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            {t("Try again")}
          </Button>
        </div>
      )}
    </div>
  );
}
