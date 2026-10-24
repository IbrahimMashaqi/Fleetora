import { expect, test } from "@playwright/test";
import { contrastRatio } from "@/tests/ui-assertions";

test("verification labels, links and primary controls meet normal-text contrast", async ({ page }) => {
  await page.goto(`/auth/verify-email?userId=ui-reader#token=${"a".repeat(64)}`);
  for (const control of [
    page.getByText("Account verification", { exact: true }),
    page.getByRole("link", { name: "Create an account" }),
    page.getByRole("button", { name: "Confirm email address" }),
  ]) {
    await expect(control).toBeVisible();
    expect(await contrastRatio(control)).toBeGreaterThanOrEqual(4.5);
  }
});

test("workspace captions and dashboard supporting text remain readable on the page background", async ({ page }) => {
  await page.goto("/signup");
  for (const label of ["Fleetora workspace", "Your starting role"]) {
    expect(await contrastRatio(page.getByText(label, { exact: true }))).toBeGreaterThanOrEqual(4.5);
  }
  let company: { id: string; name: string } | null = { id: "contrast-company", name: "Contrast Company" };
  await page.route("**/api/auth/session", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: { id: "contrast-reader", name: "Contrast Reader", email: null, role: company ? "COMPANY_ADMIN" : "PLATFORM_ADMIN", orgId: company?.id ?? null, company } }),
  }));
  for (const hasCompany of [true, false]) {
    if (!hasCompany) company = null;
    await page.goto("/app");
    const description = hasCompany ? page.getByRole("complementary", { name: "Workspace sidebar" }).getByText("Company administrator", { exact: true }) : page.getByText("You are signed in with platform-level access and no company workspace.", { exact: true });
    await expect(description).toBeVisible();
    expect(await contrastRatio(description)).toBeGreaterThanOrEqual(4.5);
  }
});

test("signup keeps controls and progress readable at 200 percent text size on narrow and short desktop screens", async ({ page }) => {
  for (const size of [{ width: 320, height: 568 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    await page.goto("/signup");
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    const card = await page.getByRole("region", { name: "Create your account" }).boundingBox();
    if (!card) throw new Error("Signup panel unavailable.");
    for (const control of [page.getByLabel("Full name"), page.getByLabel("Work email"), page.getByLabel("Password", { exact: true }), page.getByRole("button", { name: "Create account" })]) {
      const box = await control.boundingBox();
      if (!box) throw new Error("Signup control unavailable.");
      expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
      const content = await control.evaluate(element => {
        const style = getComputedStyle(element);
        return { width: element.clientWidth, scrollWidth: element.scrollWidth, requiredHeight: parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth) };
      });
      expect(box.height).toBeGreaterThanOrEqual(content.requiredHeight);
      expect(content.scrollWidth).toBeLessThanOrEqual(content.width);
    }
    const steps = await page.getByRole("list", { name: "Signup progress" }).locator("li").evaluateAll(elements => elements.map(element => {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, scrollWidth: element.scrollWidth, width: element.clientWidth };
    }));
    expect(steps[0].right).toBeLessThanOrEqual(steps[1].left);
    expect(steps.every(step => step.scrollWidth <= step.width)).toBe(true);
  }
});
