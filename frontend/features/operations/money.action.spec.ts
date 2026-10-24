import { expect, test } from "@playwright/test";
import { displayMoney, validMoneyInput } from "./money";

test("money formatting preserves minor digits without floating point arithmetic", () => {
  expect(displayMoney("9007199254740993.01", "ILS", "en")).toBe(
    "9,007,199,254,740,993.01 ILS",
  );
  expect(displayMoney("0.10", "USD", "en")).toBe("0.10 USD");
  expect(displayMoney("-12.30", "EUR", "en")).toBe("-12.30 EUR");
  expect(displayMoney("1.005", "JOD", "en")).toBe("1.005 JOD");
});

test("money inputs reject exponential notation, excess precision and negative collections", () => {
  for (const invalid of ["1e2", "0.001", "-1", "NaN", "1,000", "", "1.234567"])
    expect(validMoneyInput(invalid, "ILS")).toBe(false);
  expect(validMoneyInput("100.25", "ILS")).toBe(true);
  expect(validMoneyInput("1.005", "JOD")).toBe(true);
  expect(validMoneyInput("-1.00", "ILS", true)).toBe(true);
});
