"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useProtectedSession } from "@/features/auth/session/session-context";
import { useOperationScope } from "@/features/operations/use-operations";
import { ErrorState } from "@/features/operations/components/operations-ui";
import { useLocale } from "@/lib/i18n";
import { displayMoney } from "@/features/operations/money";
import { pricingArabic, pricingEnglish } from "./pricing-copy";
import {
  EditPricing,
  MerchantAssignment,
  PricingPager,
  PricingRead,
} from "./pricing-forms";
import { PricingDialog, PricingField, controlStyle } from "./pricing-dialog";
import type { Plan, Scope, Tariff, Zone } from "./pricing-contract";
import { usePricing } from "./use-pricing";

export function PricingWorkspace() {
  const { user } = useProtectedSession();
  if (user.role !== "COMPANY_ADMIN" || !user.company || !user.orgId)
    return <ErrorState status="forbidden" />;
  return <PricingContent key={`${user.id}:${user.orgId}`} />;
}
function PricingContent() {
  const scope = useOperationScope();
  const { locale } = useLocale();
  const c = locale === "ar" ? pricingArabic : pricingEnglish;
  const [tab, setTab] = useState<"zones" | "plans" | "assignment">("zones");
  const [notice, setNotice] = useState(false);
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">{c.title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {c.description}
        </p>
      </header>
      <div className="flex flex-wrap gap-2" aria-label={c.title}>
        {(["zones", "plans", "assignment"] as const).map((item) => (
          <Button
            key={item}
            variant={tab === item ? "default" : "outline"}
            aria-pressed={tab === item}
            onClick={() => {
              setTab(item);
              setNotice(false);
            }}
          >
            {c[item]}
          </Button>
        ))}
      </div>
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-success-border bg-success-subtle p-4 text-sm"
        >
          {c.saved}
        </p>
      )}
      {tab === "assignment" ? (
        <MerchantAssignment scope={scope} onSaved={() => setNotice(true)} />
      ) : (
        <PricingDirectory
          key={tab}
          scope={scope}
          kind={tab}
          onSaved={() => setNotice(true)}
        />
      )}
    </div>
  );
}
function PricingDirectory({
  scope,
  kind,
  onSaved,
}: {
  scope: Scope;
  kind: "zones" | "plans";
  onSaved: () => void;
}) {
  const { locale } = useLocale();
  const c = locale === "ar" ? pricingArabic : pricingEnglish;
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ zone?: Zone; plan?: Plan } | null>(
    null,
  );
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const read = usePricing(scope, { kind, page });
  const saved = () => {
    setEditor(null);
    read.retry();
    onSaved();
  };
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap justify-between gap-3">
        <h3 className="self-center font-semibold">
          {kind === "zones" ? c.zones : c.plans}
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={read.retry}>
            {c.refresh}
          </Button>
          <Button onClick={() => setEditor({})}>
            {kind === "zones" ? c.newZone : c.newPlan}
          </Button>
        </div>
      </div>
      <PricingRead {...read}>
        {(data) =>
          data.kind !== "plan" && (
            <>
              {data.page.items.length === 0 ? (
                <p className="rounded-lg border bg-surface p-6 text-sm text-muted-foreground">
                  {kind === "zones" ? c.noZones : c.noPlans}
                </p>
              ) : (
                <div
                  className="overflow-x-auto rounded-lg border bg-surface focus-visible:outline-2 focus-visible:outline-primary"
                  role="region"
                  aria-label={kind === "zones" ? c.zones : c.plans}
                  tabIndex={0}
                >
                  <table className="w-full text-start text-sm">
                    <thead className="border-b bg-secondary">
                      <tr>
                        {[
                          c.name,
                          ...(kind === "zones" ? [c.city, c.baseFee] : []),
                          c.currency,
                          c.status,
                          c.edit,
                        ].map((label) => (
                          <th
                            key={label}
                            className="whitespace-nowrap px-4 py-3 text-start font-medium"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.kind === "zones"
                        ? data.page.items.map((zone) => (
                            <tr key={zone.id}>
                              <td className="px-4 py-4 font-medium">
                                {zone.name}
                              </td>
                              <td className="px-4 py-4">{zone.city}</td>
                              <td className="px-4 py-4">
                                <bdi dir="ltr">
                                  {displayMoney(
                                    zone.baseFee,
                                    zone.currency,
                                    locale,
                                  )}
                                </bdi>
                              </td>
                              <td className="px-4 py-4">{zone.currency}</td>
                              <td className="px-4 py-4">
                                {zone.active ? c.active : c.inactive}
                              </td>
                              <td className="px-4 py-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  aria-label={`${c.edit}: ${zone.name}`}
                                  onClick={() => setEditor({ zone })}
                                >
                                  {c.edit}
                                </Button>
                              </td>
                            </tr>
                          ))
                        : data.page.items.map((plan) => (
                            <tr key={plan.id}>
                              <td className="px-4 py-4 font-medium">
                                {plan.name}
                              </td>
                              <td className="px-4 py-4">{plan.currency}</td>
                              <td className="px-4 py-4">
                                {plan.active ? c.active : c.inactive}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    aria-label={`${c.edit}: ${plan.name}`}
                                    onClick={() => setEditor({ plan })}
                                  >
                                    {c.edit}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    aria-label={`${c.tariffs}: ${plan.name}`}
                                    onClick={() => setSelectedPlan(plan.id)}
                                  >
                                    {c.tariffs}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>
              )}
              <PricingPager
                page={data.page}
                onPage={(value) => {
                  setPage(value);
                  setSelectedPlan(null);
                }}
              />
            </>
          )
        }
      </PricingRead>
      {editor && (
        <EditPricing
          scope={scope}
          kind={kind === "zones" ? "zone" : "plan"}
          {...editor}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
      {selectedPlan && (
        <PlanTariffs
          key={selectedPlan}
          scope={scope}
          planId={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onSaved={() => {
            read.retry();
            onSaved();
          }}
        />
      )}
    </section>
  );
}
function PlanTariffs({
  scope,
  planId,
  onClose,
  onSaved,
}: {
  scope: Scope;
  planId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locale } = useLocale();
  const c = locale === "ar" ? pricingArabic : pricingEnglish;
  const read = usePricing(scope, { kind: "plan", id: planId });
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-5 rounded-lg border bg-surface p-5 sm:p-6">
      <PricingRead {...read}>
        {(data) =>
          data.kind === "plan" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">
                  {c.tariffs}: {data.plan.name}
                </h3>
                <Button variant="outline" onClick={onClose}>
                  {c.close}
                </Button>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {c.baseHelp}
              </p>
              {!data.tariffs.length ? (
                <p className="text-sm text-muted-foreground">{c.noTariffs}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.tariffs.map((tariff) => (
                    <li
                      key={tariff.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          {tariff.zoneName ?? c.zone}
                          {tariff.city ? ` · ${tariff.city}` : ""}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {c.fee}:{" "}
                          <bdi dir="ltr">
                            {displayMoney(
                              tariff.fee,
                              data.plan.currency,
                              locale,
                            )}
                          </bdi>{" "}
                          · {c.discount}:{" "}
                          <bdi dir="ltr">
                            {displayMoney(
                              tariff.discount,
                              data.plan.currency,
                              locale,
                            )}
                          </bdi>
                        </p>
                        {tariff.promotionLabel && (
                          <p className="mt-1 text-muted-foreground">
                            {tariff.promotionLabel} ·{" "}
                            <bdi dir="ltr">
                              {displayMoney(
                                tariff.promotionDiscount,
                                data.plan.currency,
                                locale,
                              )}
                            </bdi>
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Button onClick={() => setOpen(true)}>{c.updateTariff}</Button>
              {open && (
                <TariffEditor
                  scope={scope}
                  plan={data.plan}
                  tariffs={data.tariffs}
                  onClose={() => setOpen(false)}
                  onSaved={() => {
                    setOpen(false);
                    read.retry();
                    onSaved();
                  }}
                />
              )}
            </>
          )
        }
      </PricingRead>
    </section>
  );
}
function TariffEditor({
  scope,
  plan,
  tariffs,
  onClose,
  onSaved,
}: {
  scope: Scope;
  plan: Plan;
  tariffs: Tariff[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locale } = useLocale();
  const c = locale === "ar" ? pricingArabic : pricingEnglish;
  const [page, setPage] = useState(1);
  const [zone, setZone] = useState<Zone | null>(null);
  const read = usePricing(scope, { kind: "zones", page });
  const tariff = tariffs.find((row) => row.zoneId === zone?.id);
  return (
    <PricingDialog
      title={`${c.tariffs}: ${plan.name}`}
      scope={scope}
      confirm
      onClose={onClose}
      onSaved={onSaved}
      operation={(data) =>
        zone
          ? {
              kind: "tariff",
              id: plan.id,
              zoneId: zone.id,
              input: {
                revision: plan.revision,
                fee: String(data.get("fee") ?? ""),
                discount: String(data.get("discount") ?? "0"),
                promotionDiscount: String(data.get("promotionDiscount") ?? "0"),
                ...(data.get("promotionLabel")
                  ? { promotionLabel: String(data.get("promotionLabel")) }
                  : {}),
              },
            }
          : null
      }
    >
      <p className="text-sm leading-6 text-muted-foreground">{c.tariffHelp}</p>
      <PricingRead {...read}>
        {(data) =>
          data.kind === "zones" && (
            <div className="space-y-3">
              <Label htmlFor="tariff-zone">{c.zone}</Label>
              <select
                id="tariff-zone"
                required
                className={controlStyle}
                value={zone?.id ?? ""}
                onChange={(event) =>
                  setZone(
                    data.page.items.find(
                      (row) => row.id === event.target.value,
                    ) ?? null,
                  )
                }
              >
                <option value="">{c.choose}</option>
                {zone && !data.page.items.some((row) => row.id === zone.id) && (
                  <option value={zone.id}>
                    {zone.city} · {zone.name}
                  </option>
                )}
                {data.page.items
                  .filter((row) => row.active && row.currency === plan.currency)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.city} · {row.name}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-muted-foreground">{c.selectZone}</p>
              <PricingPager page={data.page} onPage={setPage} />
            </div>
          )
        }
      </PricingRead>
      {zone && (
        <div key={zone.id} className="space-y-5">
          <PricingField
            name="fee"
            label={`${c.fee} (${plan.currency})`}
            value={tariff?.fee ?? zone.baseFee}
            money
          />
          <PricingField
            name="discount"
            label={c.discount}
            value={tariff?.discount ?? "0"}
            money
          />
          <PricingField
            name="promotionDiscount"
            label={c.promotion}
            value={tariff?.promotionDiscount ?? "0"}
            money
          />
          <PricingField
            name="promotionLabel"
            label={c.promotionLabel}
            value={tariff?.promotionLabel ?? ""}
            required={false}
            maxLength={200}
          />
        </div>
      )}
    </PricingDialog>
  );
}
