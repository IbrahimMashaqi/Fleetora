"use client";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ErrorState,
  EntityPicker,
  valueNumber,
  valueText,
} from "@/features/operations/components/operations-ui";
import { useOperations } from "@/features/operations/use-operations";
import type { Row } from "@/features/operations/operations-contract";
import { useLocale } from "@/lib/i18n";
import { pricingArabic, pricingEnglish } from "./pricing-copy";
import { PricingDialog, PricingField, controlStyle } from "./pricing-dialog";
import {
  currency,
  type Plan,
  type PricingData,
  type PricingPage,
  type Scope,
  type Zone,
} from "./pricing-contract";
import { usePricing } from "./use-pricing";

export function PricingRead({
  result,
  retry,
  children,
}: {
  result: ReturnType<typeof usePricing>["result"];
  retry: () => void;
  children: (data: PricingData) => ReactNode;
}) {
  const { locale } = useLocale();
  const c = locale === "ar" ? pricingArabic : pricingEnglish;
  if (!result)
    return (
      <p role="status" className="p-5 text-sm text-muted-foreground">
        {c.loading}
      </p>
    );
  if (result.status !== "ready")
    return (
      <ErrorState
        status={result.status === "saved" ? "unavailable" : result.status}
        retry={retry}
      />
    );
  return children(result.data);
}
export function PricingPager({
  page,
  onPage,
}: {
  page: PricingPage<unknown>;
  onPage: (value: number) => void;
}) {
  const { locale } = useLocale();
  const c = locale === "ar" ? pricingArabic : pricingEnglish;
  return (
    <div className="flex items-center justify-end gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page.page <= 1}
        onClick={() => onPage(page.page - 1)}
      >
        {c.previous}
      </Button>
      <span className="text-sm tabular-nums">{page.page}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!page.hasNext}
        onClick={() => onPage(page.page + 1)}
      >
        {c.next}
      </Button>
    </div>
  );
}
export function EditPricing({
  scope,
  zone,
  plan,
  kind,
  onClose,
  onSaved,
}: {
  scope: Scope;
  zone?: Zone;
  plan?: Plan;
  kind: "zone" | "plan";
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locale } = useLocale();
  const c = locale === "ar" ? pricingArabic : pricingEnglish;
  const row = zone ?? plan;
  const title =
    kind === "zone"
      ? row
        ? c.editZone
        : c.newZone
      : row
        ? c.editPlan
        : c.newPlan;
  return (
    <PricingDialog
      title={title}
      scope={scope}
      onClose={onClose}
      onSaved={onSaved}
      confirm={!!row}
      operation={(data) => {
        const selectedCurrency = data.get("currency");
        if (!currency(selectedCurrency)) return null;
        const input = {
          name: String(data.get("name") ?? ""),
          currency: selectedCurrency,
          active: data.get("active") === "on",
          ...(row ? { revision: row.revision } : {}),
        };
        return kind === "zone"
          ? {
              kind: "save-zone",
              id: row?.id,
              input: {
                ...input,
                city: String(data.get("city") ?? ""),
                baseFee: String(data.get("baseFee") ?? ""),
              },
            }
          : { kind: "save-plan", id: row?.id, input };
      }}
    >
      <PricingField name="name" label={c.name} value={row?.name} />
      {kind === "zone" && (
        <>
          <PricingField
            name="city"
            label={c.city}
            value={zone?.city}
            maxLength={100}
          />
          <PricingField
            name="baseFee"
            label={c.baseFee}
            value={zone?.baseFee}
            money
          />
        </>
      )}
      <div className="space-y-2">
        <Label htmlFor="pricing-currency">{c.currency}</Label>
        <select
          id="pricing-currency"
          name="currency"
          defaultValue={row?.currency ?? "ILS"}
          className={controlStyle}
          aria-readonly={!!row}
        >
          {row ? (
            <option value={row.currency}>{row.currency}</option>
          ) : (
            ["ILS", "USD", "EUR", "JOD"].map((value) => (
              <option key={value}>{value}</option>
            ))
          )}
        </select>
        {row && (
          <p className="text-xs text-muted-foreground">{c.currencyFixed}</p>
        )}
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input
          name="active"
          type="checkbox"
          defaultChecked={row?.active ?? true}
          className="size-4 accent-primary"
        />
        {c.active}
      </label>
    </PricingDialog>
  );
}
function PlanSelector({
  scope,
  selected,
  onSelect,
  requiredCurrency,
}: {
  scope: Scope;
  selected: Plan | null;
  onSelect: (plan: Plan | null) => void;
  requiredCurrency: string;
}) {
  const { locale } = useLocale();
  const c = locale === "ar" ? pricingArabic : pricingEnglish;
  const [page, setPage] = useState(1);
  const read = usePricing(scope, { kind: "plans", page });
  return (
    <PricingRead {...read}>
      {(data) =>
        data.kind === "plans" && (
          <div className="space-y-3">
            <Label htmlFor="assign-plan">{c.plan}</Label>
            <select
              id="assign-plan"
              required
              className={controlStyle}
              value={selected?.id ?? ""}
              onChange={(event) =>
                onSelect(
                  data.page.items.find(
                    (plan) => plan.id === event.target.value,
                  ) ?? null,
                )
              }
            >
              <option value="">{c.choose}</option>
              {selected &&
                !data.page.items.some((plan) => plan.id === selected.id) && (
                  <option value={selected.id}>{selected.name}</option>
                )}
              {data.page.items
                .filter(
                  (plan) => plan.active && plan.currency === requiredCurrency,
                )
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {plan.currency}
                  </option>
                ))}
            </select>
            <p className="text-xs text-muted-foreground">{c.selectPlan}</p>
            <PricingPager page={data.page} onPage={setPage} />
          </div>
        )
      }
    </PricingRead>
  );
}
export function AssignPlan({
  scope,
  merchant,
  onSaved,
  onClose,
}: {
  scope: Scope;
  merchant: Row;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const c = locale === "ar" ? pricingArabic : pricingEnglish;
  const [plan, setPlan] = useState<Plan | null>(null);
  return (
    <PricingDialog
      title={`${c.assign}: ${valueText(merchant, "name")}`}
      scope={scope}
      confirm
      onClose={onClose}
      onSaved={onSaved}
      operation={(data) =>
        plan
          ? {
              kind: "assignment",
              id: merchant.id,
              input: {
                planId: plan.id,
                revision: valueNumber(merchant, "revision"),
                discountAmount: String(data.get("discountAmount") ?? ""),
              },
            }
          : null
      }
    >
      <p className="text-sm leading-6 text-muted-foreground">
        {c.assignmentHelp}
      </p>
      <PlanSelector
        scope={scope}
        selected={plan}
        onSelect={setPlan}
        requiredCurrency={valueText(merchant, "currency")}
      />
      <PricingField
        name="discountAmount"
        label={c.merchantDiscount}
        value="0"
        money
      />
    </PricingDialog>
  );
}
export function MerchantAssignment({
  scope,
  onSaved,
}: {
  scope: Scope;
  onSaved: () => void;
}) {
  const { locale } = useLocale();
  const c = locale === "ar" ? pricingArabic : pricingEnglish;
  const [merchantId, setMerchantId] = useState("");
  return (
    <section className="space-y-5 rounded-lg border bg-surface p-5 sm:p-6">
      <h3 className="font-semibold">{c.assignment}</h3>
      <p className="text-sm text-muted-foreground">{c.assignmentHelp}</p>
      <div
        onChange={(event) => {
          const target = event.target;
          if (
            target instanceof HTMLSelectElement &&
            target.name === "merchantId"
          )
            setMerchantId(target.value);
        }}
      >
        <EntityPicker
          scope={scope}
          field={{
            name: "merchantId",
            label: "Merchant",
            lookup: "merchants",
            required: true,
          }}
        />
      </div>
      {merchantId && (
        <SelectedMerchant
          key={merchantId}
          scope={scope}
          merchantId={merchantId}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}
function SelectedMerchant({
  scope,
  merchantId,
  onSaved,
}: {
  scope: Scope;
  merchantId: string;
  onSaved: () => void;
}) {
  const { locale } = useLocale();
  const c = locale === "ar" ? pricingArabic : pricingEnglish;
  const read = useOperations(scope, { resource: "merchants", id: merchantId });
  const [open, setOpen] = useState(false);
  if (!read.result) return <p role="status">{c.loading}</p>;
  if (read.result.status !== "ready")
    return <ErrorState status={read.result.status} retry={read.retry} />;
  if (read.result.data.kind !== "merchant") return null;
  const merchant = read.result.data.merchant;
  return (
    <div className="space-y-3">
      <p className="text-sm">
        {c.currentMerchant}: <strong>{valueText(merchant, "name")}</strong> ·{" "}
        {valueText(merchant, "currency")}
      </p>
      <Button onClick={() => setOpen(true)}>{c.assign}</Button>
      {open && (
        <AssignPlan
          scope={scope}
          merchant={merchant}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            read.retry();
            onSaved();
          }}
        />
      )}
    </div>
  );
}
