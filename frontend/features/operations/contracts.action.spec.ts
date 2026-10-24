import { expect, test } from "@playwright/test";
import {
  operationEndpoint,
  parseMerchant,
  parseParcel,
  writeFields,
} from "./operations-contract";

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
