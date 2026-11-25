import type { Locale } from "@/lib/i18n";

/** Pickup times in the active language, to the minute (no seconds). */
export function formatPickupTime(value: string | null | undefined, locale: Locale) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/** A window reads as one range, or a single "—" when it has not been set. */
export function formatPickupWindow(
  from: string | null | undefined,
  to: string | null | undefined,
  locale: Locale,
) {
  if (!from && !to) return "—";
  return `${formatPickupTime(from, locale)} – ${formatPickupTime(to, locale)}`;
}
