export const driverActivationFailures = [
  "invalid",
  "expired",
  "used-or-revoked",
  "password-rules",
  "phone-in-use",
  "limited",
  "unavailable",
  "request-rejected",
] as const;
export type DriverActivationFailure = (typeof driverActivationFailures)[number];
export function isDriverActivationFailure(
  value: unknown,
): value is DriverActivationFailure {
  return driverActivationFailures.some((status) => status === value);
}
