import { expect, test } from "@playwright/test";
import { formatPickupTime, formatPickupWindow } from "./pickup-format";

test("formats pickup times to the minute in the active language", () => {
  const value = "2026-10-25T07:38:28Z";
  const en = formatPickupTime(value, "en");
  const ar = formatPickupTime(value, "ar");
  expect(en).not.toMatch(/:28\b/);
  expect(en).toMatch(/2026/);
  expect(ar).not.toBe(en);
  expect(ar).toMatch(/[\u0600-\u06FF]/);
});

test("shows one dash for an unset window and a single range otherwise", () => {
  expect(formatPickupWindow(null, null, "en")).toBe("—");
  expect(formatPickupWindow(undefined, undefined, "ar")).toBe("—");
  const range = formatPickupWindow(
    "2026-10-25T07:00:00Z",
    "2026-10-25T08:00:00Z",
    "en",
  );
  expect(range).toContain(" – ");
  expect(range).not.toContain("——");
  expect(formatPickupTime("not a date", "en")).toBe("—");
});
