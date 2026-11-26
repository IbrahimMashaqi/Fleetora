"use client";
import { useEffect, useId, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/lib/i18n";
import { withSessionLock } from "@/lib/auth/session-lock";
import { pricingAction } from "@/features/merchant-pricing/pricing.action";
import type { Quote, Zone } from "@/features/merchant-pricing/pricing-contract";
import { readWarehousesAction } from "@/features/warehouses/warehouses.action";
import type { Warehouse } from "@/features/warehouses/warehouses.types";
import type { Scope } from "../operations-contract";
import { displayMoney } from "../money";
import type { Field } from "./operations-ui";

const controlStyle =
  "min-h-10 w-full rounded-md border border-[var(--control-border)] bg-surface px-3 py-2 text-start text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";
const amountPattern = /^\d{1,14}(?:\.\d{1,3})?$/;
type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; quote: Quote }
  | { status: "unavailable" };

/**
 * Destination zone picker plus a live quote from the same pricing engine the
 * backend uses on save. The quote's version travels with the form so the save
 * is refused if prices changed in between.
 */
export function PricingQuoteField({
  scope,
  field,
}: {
  scope: Scope;
  field: Field;
}) {
  const { t, locale } = useLocale();
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [zonesFailed, setZonesFailed] = useState(false);
  const [state, setState] = useState<QuoteState>({ status: "idle" });
  const request = useRef(0);
  // Last merchant/zone/amount quoted; blur "change" events must not re-quote.
  const quotedKey = useRef("");

  useEffect(() => {
    let active = true;
    void withSessionLock(() => pricingAction(scope, { kind: "zones", page: 1 }))
      .then((result) => {
        if (!active) return;
        if (result.status === "ready" && result.data.kind === "zones")
          setZones(result.data.page.items.filter((zone) => zone.active));
        else setZonesFailed(true);
      })
      .catch((error) => {
        unstable_rethrow(error);
        if (active) setZonesFailed(true);
      });
    return () => {
      active = false;
    };
  }, [scope]);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = (name: string) => {
      const value = new FormData(form).get(name);
      return typeof value === "string" ? value.trim() : "";
    };
    const update = () => {
      clearTimeout(timer);
      const merchantId = read("merchantId");
      const zoneId = read("zoneId");
      const finalCustomerAmount = read("finalCustomerAmount");
      const key = `${merchantId}|${zoneId}|${finalCustomerAmount}`;
      if (key === quotedKey.current) return;
      quotedKey.current = key;
      if (!merchantId || !zoneId || !amountPattern.test(finalCustomerAmount)) {
        request.current += 1;
        setState({ status: "idle" });
        return;
      }
      setState({ status: "loading" });
      timer = setTimeout(() => {
        const current = ++request.current;
        void withSessionLock(() =>
          pricingAction(scope, {
            kind: "quote",
            merchantId,
            zoneId,
            finalCustomerAmount,
          }),
        )
          .then((result) => {
            if (current !== request.current) return;
            setState(
              result.status === "ready" && result.data.kind === "quote"
                ? { status: "ready", quote: result.data.quote }
                : { status: "unavailable" },
            );
          })
          .catch((error) => {
            unstable_rethrow(error);
            if (current === request.current) setState({ status: "unavailable" });
          });
      }, 350);
    };
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    update();
    return () => {
      clearTimeout(timer);
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, [scope, zones]);

  const money = (amount: string, currency: string) =>
    displayMoney(amount, currency, locale);
  return (
    <div ref={anchor} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={id}>{t("Destination zone")}</Label>
        <select
          id={id}
          name="zoneId"
          required
          defaultValue={typeof field.value === "string" ? field.value : ""}
          className={controlStyle}
          disabled={!zones}
        >
          <option value="">
            {zones ? t("Choose zone") : t("Loading operations...")}
          </option>
          {zones?.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name} ({zone.city})
            </option>
          ))}
        </select>
        {zonesFailed && (
          <p role="alert" className="text-xs text-danger-foreground">
            {t("Operations are temporarily unavailable. Try again.")}
          </p>
        )}
      </div>
      <input
        type="hidden"
        name="pricingVersion"
        value={state.status === "ready" ? state.quote.pricingVersion : ""}
      />
      <section
        aria-label={t("Price quote")}
        aria-live="polite"
        className="rounded-md border bg-surface-secondary p-4 text-sm"
      >
        {state.status === "idle" && (
          <p className="text-muted-foreground">
            {t("Choose a merchant, zone and amount to see the price.")}
          </p>
        )}
        {state.status === "loading" && (
          <p role="status" className="text-muted-foreground">
            {t("Calculating price...")}
          </p>
        )}
        {state.status === "unavailable" && (
          <p role="alert" className="text-danger-foreground">
            {t(
              "No price is available for this merchant and zone. Check the merchant's plan.",
            )}
          </p>
        )}
        {state.status === "ready" && (
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
            <dt>{t("Delivery fee (merchant pays)")}</dt>
            <dd className="text-end font-medium tabular-nums">
              <bdi>{money(state.quote.deliveryFee, state.quote.currency)}</bdi>
            </dd>
            <dt>{t("Final amount to collect")}</dt>
            <dd className="text-end font-semibold tabular-nums">
              <bdi>
                {money(state.quote.finalCustomerAmount, state.quote.currency)}
              </bdi>
            </dd>
            <dt className="text-muted-foreground">{t("Merchant receives")}</dt>
            <dd className="text-end tabular-nums text-muted-foreground">
              <bdi>
                {money(
                  state.quote.expectedMerchantProceeds,
                  state.quote.currency,
                )}
              </bdi>
            </dd>
          </dl>
        )}
      </section>
    </div>
  );
}

/** Active warehouses of the signed-in company, for receiving a parcel. */
export function WarehouseField({
  scope,
  field,
}: {
  scope: Scope;
  field: Field;
}) {
  const { t } = useLocale();
  const id = useId();
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void withSessionLock(() =>
      readWarehousesAction(scope, {
        search: "",
        status: "ACTIVE",
        page: 1,
        pageSize: 50,
      }),
    )
      .then((result) => {
        if (!active) return;
        if (result.status === "list") setWarehouses(result.data.items);
        else setFailed(true);
      })
      .catch((error) => {
        unstable_rethrow(error);
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [scope]);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t(field.label)}</Label>
      <select
        id={id}
        name={field.name}
        required
        className={controlStyle}
        disabled={!warehouses?.length}
        defaultValue=""
      >
        <option value="">
          {warehouses ? t("Choose warehouse") : t("Loading warehouses...")}
        </option>
        {warehouses?.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.name}
          </option>
        ))}
      </select>
      {warehouses?.length === 0 && (
        <p role="alert" className="text-xs text-danger-foreground">
          {t("No active warehouses. Add one under Warehouses first.")}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-xs text-danger-foreground">
          {t("Operations are temporarily unavailable. Try again.")}
        </p>
      )}
    </div>
  );
}
