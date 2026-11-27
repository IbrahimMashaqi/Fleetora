export const driverAccessErrors = {
  HTTPS_REQUIRED: [
    "Configure an HTTPS activation website before creating driver invitations.",
    "هيّئ موقع تفعيل آمنًا عبر HTTPS قبل إنشاء دعوات السائقين.",
  ],
  PHONE_IN_USE: [
    "This phone is already used by another driver account.",
    "هذا الرقم مستخدم لحساب سائق آخر.",
  ],
  INVALID_PHONE: [
    "Enter a valid Palestinian or Israeli mobile number.",
    "أدخل رقم هاتف محمول فلسطينيًا أو إسرائيليًا صالحًا.",
  ],
  PERMISSION_DENIED: [
    "You don't have permission to manage driver access.",
    "ليس لديك صلاحية إدارة وصول السائق.",
  ],
  SESSION_CHANGED: [
    "Your session changed. Refresh before trying again.",
    "تغيرت جلستك. حدّث الصفحة قبل المحاولة مجددًا.",
  ],
  DRIVER_UNAVAILABLE: [
    "Driver is suspended or offboarded.",
    "السائق موقوف أو أُنهي عمله.",
  ],
  IDENTITY_CHANGED: [
    "Driver access changed. Refresh before trying again.",
    "تغير وصول السائق. حدّث الصفحة قبل المحاولة مجددًا.",
  ],
  INVITATION_ACCEPTED: [
    "This invitation was already accepted. Revoke driver access instead.",
    "قُبلت هذه الدعوة بالفعل. ألغِ وصول السائق بدلًا من ذلك.",
  ],
  NOT_FOUND: [
    "This driver is no longer available. Refresh the list.",
    "هذا السائق لم يعد متاحًا. حدّث القائمة.",
  ],
  INVALID: [
    "Check the driver phone and invitation details.",
    "تحقق من رقم السائق وتفاصيل الدعوة.",
  ],
  UNAVAILABLE: [
    "Driver access is temporarily unavailable. Try again later.",
    "وصول السائق غير متاح مؤقتًا. حاول لاحقًا.",
  ],
  UNCERTAIN: [
    "Result unknown. Refresh before trying again.",
    "النتيجة غير مؤكدة. حدّث قبل المحاولة مجددًا.",
  ],
} as const;
export type DriverAccessError = keyof typeof driverAccessErrors;

// Translate only known domain messages. Never render raw infrastructure errors.
export function driverAccessReason(
  body: unknown,
): DriverAccessError | undefined {
  if (!body || typeof body !== "object" || !("message" in body)) return;
  const messages: unknown[] = Array.isArray(body.message)
    ? body.message
    : [body.message];
  const reasons: Record<string, DriverAccessError> = {
    "Driver invitations require an HTTPS FRONTEND_URL": "HTTPS_REQUIRED",
    "This phone already has a driver account": "PHONE_IN_USE",
    "A valid Palestinian or Israeli mobile number is required": "INVALID_PHONE",
    "Operation is not permitted": "PERMISSION_DENIED",
    "Session context changed": "SESSION_CHANGED",
    "Driver is suspended/offboarded": "DRIVER_UNAVAILABLE",
    "Driver is suspended": "DRIVER_UNAVAILABLE",
    "Driver is offboarded": "DRIVER_UNAVAILABLE",
    "Driver identity changed; retry": "IDENTITY_CHANGED",
    "Driver identity changed": "IDENTITY_CHANGED",
    "Invitation already accepted; revoke driver access instead":
      "INVITATION_ACCEPTED",
    "Driver not found": "NOT_FOUND",
    "Driver identity operation could not be completed": "UNAVAILABLE",
  };
  for (const message of messages) {
    if (typeof message === "string" && Object.hasOwn(reasons, message))
      return reasons[message];
  }
}

export function driverAccessErrorText(
  result: { status: string; reason?: DriverAccessError },
  locale: "en" | "ar",
) {
  const fallback: Record<string, DriverAccessError> = {
    forbidden: "PERMISSION_DENIED",
    changed: "SESSION_CHANGED",
    "not-found": "NOT_FOUND",
    invalid: "INVALID",
    conflict: "IDENTITY_CHANGED",
    uncertain: "UNCERTAIN",
    unauthenticated: "SESSION_CHANGED",
  };
  return driverAccessErrors[
    result.reason ?? fallback[result.status] ?? "UNAVAILABLE"
  ][locale === "ar" ? 1 : 0];
}
