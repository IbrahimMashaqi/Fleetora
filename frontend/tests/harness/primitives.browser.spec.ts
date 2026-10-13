import { expect, test } from "@playwright/test";
import { contrastRatio } from "../ui-assertions";

test("default Button never submits accidentally and preserves link/disabled semantics", async ({ page }) => {
  await page.goto("/test-ui");
  await page.getByRole("button", { name: "Local action" }).click();
  await expect(page.getByRole("status")).toHaveText("Submissions: 0");
  await page.getByRole("button", { name: "Save probe" }).click();
  await expect(page.getByRole("status")).toHaveText("Submissions: 1");
  await expect(page.getByRole("link", { name: "Probe link" })).not.toHaveAttribute("type");
  await expect(page.getByRole("button", { name: "Unavailable action" })).toBeDisabled();
});

test("primitives retain readable contrast and reduced-motion keyboard focus", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/test-ui");
  const input = page.getByLabel("Probe value");
  const button = page.getByRole("button", { name: "Local action" });
  expect(await contrastRatio(button)).toBeGreaterThanOrEqual(4.5);
  expect(await contrastRatio(input, "border-top-color")).toBeGreaterThanOrEqual(3);
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await expect(input).toHaveCSS("outline-width", "2px");
  await expect(input).toHaveCSS("transition-duration", "0s");
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await expect(button).toHaveCSS("transition-duration", "0s");
});
