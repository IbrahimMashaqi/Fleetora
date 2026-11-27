import { expect, test } from "@playwright/test";
import { typeWithoutNavigation } from "../focus-retention";
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "fleetora_locale", value: "ar", url: "http://localhost:3100" },
  ]);
});

test("single-field RTL combobox loads ten, selects by keyboard and clears", async ({
  page,
}) => {
  await page.goto("/test-combobox");
  const input = page.getByRole("combobox", { name: "التاجر" });
  await input.focus();
  await expect(page.getByRole("option")).toHaveCount(10);
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(page.getByTestId("selected")).not.toHaveText("empty");
  await expect(page.locator('input[name="merchantId"]')).not.toHaveValue("");
  await page.getByRole("button", { name: "مسح الاختيار" }).click();
  await expect(page.getByTestId("selected")).toHaveText("empty");
});
test("debounced server results, no results and stale requests", async ({
  page,
}) => {
  await page.goto("/test-combobox");
  const input = page.getByRole("combobox");
  await input.fill("slow");
  await expect(page.getByTestId("queries")).toContainText("slow");
  await input.fill("none");
  await expect(page.getByText("لا توجد نتائج", { exact: true })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByRole("option")).toHaveCount(0);
  await input.fill("احمد");
  await expect(page.getByRole("option")).toHaveCount(20);
  await input.press("Escape");
  await expect(page.getByRole("listbox")).not.toBeVisible();
});
test("popup is selectable inside a native modal and Arabic dates submit ISO", async ({
  page,
}) => {
  await page.goto("/test-combobox");
  const date = page.getByLabel("من تاريخ", { exact: true });
  await expect(date).toHaveValue("٢٧/١١/٢٠٢٦");
  await date.fill("٢٨/١١/٢٠٢٦");
  await expect(page.locator('input[name="from"]')).toHaveValue("2026-11-28");
  await date.fill("٣١/٠٢/٢٠٢٦");
  await expect(date).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Open dialog" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await dialog.getByRole("option").first().click();
  await expect(page.getByTestId("selected")).not.toHaveText("empty");
});

test("UX-01 draft text changes neither selection nor input identity until selection or clear", async ({ page }) => {
  await page.goto("/test-combobox");
  await page.getByRole("button", { name: "Set existing record" }).click();
  const input = page.getByRole("combobox", { name: "التاجر", exact: true });
  const original = await input.elementHandle();
  await typeWithoutNavigation(page, input);
  await expect(page.locator('input[name="merchantId"]')).toHaveValue("existing");
  await expect(page.getByRole("option")).toHaveCount(20);
  await input.press("ArrowDown"); await input.press("Enter");
  await expect(page.locator('input[name="merchantId"]')).not.toHaveValue("existing");
  await expect(input).toBeFocused();
  expect(await original?.evaluate(element => element.isConnected)).toBe(true);
  await page.getByRole("button", { name: "مسح الاختيار" }).click();
  await expect(page.locator('input[name="merchantId"]')).toHaveValue("");
  expect(await original?.evaluate(element => element.isConnected)).toBe(true);
});
