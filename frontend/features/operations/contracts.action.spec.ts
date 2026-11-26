import { expect, test } from "@playwright/test";
import {
  operationEndpoint,
  parseMerchant,
  parseParcel,
  writeFields,
} from "./operations-contract";
import { merchantFields, parcelFields } from "./components/operation-forms";

test("outgoing operations constrain routes and allowlist ownership-free fields", () => {
  expect(
    operationEndpoint({
      resource: "parcels",
      action: "transition",
      id: "11111111-1111-4111-8111-111111111111",
    }),
  ).toBe("parcels/11111111-1111-4111-8111-111111111111/transition");
  expect(
    operationEndpoint({
      resource: "parcels",
      action: "transition",
      id: "../users",
    }),
  ).toBeNull();
  expect(
    writeFields({
      resource: "collections",
      action: "create",
      input: {
        parcelId: "id",
        amount: "10.00",
        method: "CASH",
        idempotencyKey: "request",
        companyId: "foreign",
        role: "PLATFORM_ADMIN",
      },
    }),
  ).toEqual({
    parcelId: "id",
    amount: "10.00",
    method: "CASH",
    idempotencyKey: "request",
  });
});

test("malformed directory projections never masquerade as valid merchants or parcels", () => {
  expect(parseMerchant({ id: "1", password: "private" })).toBeNull();
  expect(
    parseParcel({ id: "1", companyId: "foreign", recipientName: "private" }),
  ).toBeNull();
});

test("OD-10/BR-083: parcel priority offers only Normal, High and Urgent", () => {
  const priority = parcelFields().find((field) => field.name === "priority");
  expect(priority?.value).toBe("NORMAL");
  expect(priority?.options?.map((option) => option.value)).toEqual(["NORMAL", "HIGH", "URGENT"]);
});

test("OD-02/BR-066: merchant terms offer only the company currency", () => {
  for (const currency of ["ILS", "JOD"] as const) {
    const field = merchantFields(null, currency).find((entry) => entry.name === "currency");
    expect(field?.value).toBe(currency);
    expect(field?.options?.map((option) => option.value)).toEqual([currency]);
  }
});

test("OD-13/BR-093: merchants carry their activation state; operational pickers list only ACTIVE ones", () => {
  const merchant = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Fixture merchant",
    currency: "ILS",
    deliveryFee: "15.00",
    returnFee: "5.00",
    serviceFee: "0.00",
    revision: 1,
    active: true,
  };
  for (const activationStatus of ["PENDING", "ACTIVE"])
    expect(parseMerchant({ ...merchant, activationStatus, legacyActivation: false })).toMatchObject({
      activationStatus,
    });
  expect(parseMerchant(merchant)).toBeNull();
  expect(parseMerchant({ ...merchant, activationStatus: "SUSPENDED" })).toBeNull();
  const picker = parcelFields().find((field) => field.name === "merchantId");
  expect(picker?.lookupQuery).toEqual({ activationStatus: "ACTIVE" });
});
