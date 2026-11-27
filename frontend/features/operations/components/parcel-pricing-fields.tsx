"use client";
import { useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { EntityCombobox } from "./entity-combobox";
import { useLocale } from "@/lib/i18n";
import { withSessionLock } from "@/lib/auth/session-lock";
import { operationalPricingAction as pricingAction } from "@/features/merchant-pricing/pricing.action";
import type { Quote } from "@/features/merchant-pricing/pricing-contract";
import type { Scope } from "../operations-contract";
import { displayMoney } from "../money";
import type { Field } from "./operations-ui";

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
  const anchor = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<QuoteState>({ status: "idle" });
  const request = useRef(0);
  // Last merchant/zone/amount quoted; blur "change" events must not re-quote.
  const quotedKey = useRef("");

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
            if (current === request.current)
              setState({ status: "unavailable" });
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
  }, [scope]);

  const money = (amount: string, currency: string) =>
    displayMoney(amount, currency, locale);
  return (
    <div ref={anchor} className="space-y-3">
      <EntityCombobox scope={scope} kind="zones" name="zoneId" label="Destination zone"
        placeholder="Choose zone" required initialValue={typeof field.value === "string" ? field.value : ""} />
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
  return <EntityCombobox scope={scope} kind="warehouses" name={field.name} label={field.label}
    placeholder="Choose warehouse" required={field.required} initialValue={String(field.value ?? "")} />;
}
