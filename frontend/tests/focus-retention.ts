import { expect, type Locator, type Page } from "@playwright/test";

/** Each character must stay on the same DOM input, without a route/action round trip. */
export async function typeWithoutNavigation(
  page: Page,
  input: Locator,
  text = "مح",
) {
  const url = page.url();
  const original = await input.elementHandle();
  if (!original) throw new Error("Missing search input");
  const navigations: string[] = [],
    actions: string[] = [];
  const onNavigation = () => navigations.push(page.url());
  const onRequest = (request: import("@playwright/test").Request) => {
    if (request.headers()["next-action"]) actions.push(request.url());
  };
  page.on("framenavigated", onNavigation);
  page.on("request", onRequest);
  try {
    await input.focus();
    await input.fill("");
    let draft = "";
    for (const character of text) {
      draft += character;
      await input.pressSequentially(character);
      await expect(input).toHaveValue(draft);
      await expect(input).toBeFocused();
      await expect
        .poll(() =>
          original.evaluate(
            (element) =>
              element.isConnected && element === document.activeElement,
          ),
        )
        .toBe(true);
      await page.waitForTimeout(300);
      await expect(input).toBeFocused();
      expect(page.url()).toBe(url);
    }
    expect(navigations).toEqual([]);
    expect(actions).toEqual([]);
  } finally {
    page.off("framenavigated", onNavigation);
    page.off("request", onRequest);
  }
}
