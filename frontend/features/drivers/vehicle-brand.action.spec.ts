import { expect, test } from "@playwright/test";
import {
  normalizeVehicleBrand,
  vehicleTypeLabel,
} from "@/components/vehicles/vehicle-brands";
for (const [input, key] of [
  ["Mercedes", "mercedes-benz"],
  ["Mercedes-Benz", "mercedes-benz"],
  [" MERCEDES BENZ ", "mercedes-benz"],
  ["Skoda", "skoda"],
  ["\u0160koda", "skoda"],
  ["SKODA", "skoda"],
  ["VW", "volkswagen"],
  ["Volkswagen", "volkswagen"],
  ["BMW", "bmw"],
  ["B.M.W.", "bmw"],
  ["toyota", "toyota"],
  ["Hyundai", "hyundai"],
] as const) {
  test(`normalizes real manufacturer identity: ${input}`, () => {
    expect(normalizeVehicleBrand(input)?.key).toBe(key);
    expect(normalizeVehicleBrand(input)?.src).toBe(
      `/vehicle-brands/${key}.svg`,
    );
  });
}
for (const input of [
  null,
  undefined,
  "",
  " ",
  "Unlisted Motors",
  "BMW Motorcycles Unlimited",
  "constructor",
  "__proto__",
]) {
  test(`does not guess a brand from ${String(input)}`, () =>
    expect(normalizeVehicleBrand(input)).toBeNull());
}
for (const [input, label] of [
  ["MOTORCYCLE", "Motorcycle"],
  ["BICYCLE", "Bicycle"],
  ["CAR", "Car"],
  ["VAN", "Van"],
  ["TRUCK", "Truck"],
  ["SPACECRAFT", "Vehicle"],
] as const) {
  test(`labels the ${input} fallback`, () =>
    expect(vehicleTypeLabel(input)).toBe(label));
}
