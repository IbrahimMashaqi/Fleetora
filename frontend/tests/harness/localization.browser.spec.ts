import { expect, test } from "@playwright/test";

test("switches English and Arabic, persists the preference, and applies RTL", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(
    page.getByRole("heading", { name: "Welcome back", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: "Switch language to English" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { name: "Switch language to Arabic" }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "مرحباً بعودتك", exact: true }),
  ).toBeVisible();
  expect(
    (await context.cookies()).find((cookie) => cookie.name === "fleetora_locale")
      ?.value,
  ).toBe("ar");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(
    page.getByRole("heading", { name: "مرحباً بعودتك", exact: true }),
  ).toBeVisible();
  await page.goto("/forgot-password");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "إعادة تعيين كلمة المرور", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "اللغة", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "التبديل إلى الإنجليزية" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});
