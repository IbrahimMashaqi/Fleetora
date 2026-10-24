import type { Locale } from "@/lib/i18n";

export function currencyDigits(currency: string) {
  return currency === "JOD" ? 3 : 2;
}

export function validMoneyInput(
  amount: string,
  currency: string,
  signed = false,
): boolean {
  return new RegExp(
    `^${signed ? "-?" : ""}(?:0|[1-9][0-9]{0,15})(?:\\.[0-9]{1,${currencyDigits(currency)}})?$`,
  ).test(amount);
}

/** Display decimal strings directly; no conversion to a floating-point number. */
export function displayMoney(
  amount: string,
  currency: string,
  locale: Locale,
): string {
  if (
    !["ILS", "USD", "EUR", "JOD"].includes(currency) ||
    !new RegExp(
      `^-?[0-9]{1,64}(?:\\.[0-9]{1,${currencyDigits(currency)}})?$`,
    ).test(amount)
  )
    return "—";
  const negative = amount.startsWith("-");
  const [whole, fraction = ""] = amount.replace(/^-/, "").split(".");
  const formatter = new Intl.NumberFormat(locale);
  const decimal =
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((part) => part.type === "decimal")?.value ?? ".";
  const digits = Array.from({ length: 10 }, (_, index) =>
    formatter.format(index),
  );
  const tail = fraction
    .padEnd(currencyDigits(currency), "0")
    .replace(/[0-9]/g, (digit) => digits[Number(digit)]);
  return `${negative ? "-" : ""}${formatter.format(BigInt(whole))}${decimal}${tail} ${currency}`;
}
