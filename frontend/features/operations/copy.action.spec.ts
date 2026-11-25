import { expect, test } from "@playwright/test";
import { operationsArabic, operationsEnglish } from "./operations-copy";
import { pricingArabic, pricingEnglish } from "@/features/merchant-pricing/pricing-copy";
import { warehousesArabic, warehousesEnglish } from "@/features/warehouses/warehouses-copy";

const plainCopy = [
  "Record the full amount collected from the customer. Partial amounts aren't supported.",
  "A draft holds these amounts for this settlement until you approve or cancel it.",
  "Approving a settlement doesn't pay it. Record the payment separately.",
  "Nothing to settle yet. Delivered and collected parcels appear here once the cash is remitted.",
  "Business profile",
] as const;

test("UX copy exists in English and Arabic and developer wording is gone", () => {
  for (const key of plainCopy) {
    expect(operationsEnglish).toHaveProperty([key], key);
    expect(operationsArabic[key]).toMatch(/[\u0600-\u06FF]/);
  }
  const text = JSON.stringify([operationsEnglish, pricingEnglish]);
  for (const jargon of [
    "Full amounts only",
    "Draft lines reserve eligible funds",
    "fee snapshots",
  ])
    expect(text).not.toContain(jargon);
  expect(pricingEnglish.updateTariff).toBe("Add zone tariff");
  expect(pricingArabic.updateTariff).toMatch(/[\u0600-\u06FF]/);
  expect(pricingEnglish.future).toBe("Parcels already created keep their current price.");
  expect(warehousesEnglish["Warehouse changes saved."]).toBe("Warehouse changes saved.");
  expect(warehousesArabic["Warehouse changes saved."]).toMatch(/[\u0600-\u06FF]/);
});
