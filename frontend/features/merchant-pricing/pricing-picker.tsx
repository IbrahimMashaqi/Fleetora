"use client";
import { useCallback, useId, useRef } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { withSessionLock } from "@/lib/auth/session-lock";
import { pricingAction } from "./pricing.action";
import type { Plan, Zone, Scope } from "./pricing-contract";

export function PricingPicker({
  scope,
  kind,
  label,
  placeholder,
  value,
  onChange,
}: {
  scope: Scope;
  kind: "zones" | "plans";
  label: string;
  placeholder: string;
  value: Plan | Zone | null;
  onChange: (value: Plan | Zone | null) => void;
}) {
  const id = useId(),
    rows = useRef(new Map<string, Plan | Zone>());
  const search = useCallback(
    async (text: string) => {
      const result = await withSessionLock(() =>
        pricingAction(scope, { kind, page: 1, search: text }),
      );
      if (
        result.status !== "ready" ||
        (result.data.kind !== "zones" && result.data.kind !== "plans")
      )
        throw new Error("Pricing lookup unavailable");
      return result.data.page.items.map((row) => {
        rows.current.set(row.id, row);
        return {
          value: row.id,
          label: row.name,
          detail: "city" in row ? row.city : row.currency,
        };
      });
    },
    [scope, kind],
  );
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Combobox
        id={id}
        label={label}
        placeholder={placeholder}
        required
        value={value ? { value: value.id, label: value.name } : null}
        search={search}
        onChange={(option) =>
          onChange(option ? (rows.current.get(option.value) ?? null) : null)
        }
      />
    </div>
  );
}
