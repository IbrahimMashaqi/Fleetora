import { expect, test } from "@playwright/test";

test("loads original local manufacturer assets and descriptive type fallbacks", async ({
  page,
}) => {
  const externalImages: string[] = [];
  page.on("request", (request) => {
    if (
      request.resourceType() === "image" &&
      !request.url().startsWith("http://localhost:3100")
    )
      externalImages.push(request.url());
  });
  await page.goto("/test-vehicle-brand");
  for (const brand of [
    "Škoda",
    "Mercedes-Benz",
    "BMW",
    "Toyota",
    "Hyundai",
    "Volkswagen",
  ]) {
    const logo = page.getByRole("img", {
      name: `Vehicle brand logo: ${brand}`,
      exact: true,
    });
    await expect(logo).toBeVisible();
    await expect
      .poll(() =>
        logo.evaluate(
          (element) =>
            element instanceof HTMLImageElement &&
            element.complete &&
            element.naturalWidth > 0,
        ),
      )
      .toBe(true);
    await expect(logo).toHaveCSS("object-fit", "contain");
  }
  for (const type of [
    "Motorcycle",
    "Bicycle",
    "Car",
    "Van",
    "Truck",
    "Vehicle",
  ]) {
    await expect(
      page.getByRole("img", { name: `Vehicle type icon: ${type}`, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("img", {
      name: "Vehicle icon: Unlisted Motors, Car",
    }),
  ).toBeVisible();
  expect(externalImages).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("vehicle-brand-assets.png"),
    fullPage: true,
  });
});

test("replaces a failed manufacturer image with its named vehicle icon", async ({
  page,
}) => {
  await page.route("**/vehicle-brands/bmw.svg", (route) => route.abort());
  await page.goto("/test-vehicle-brand");
  await expect(
    page.getByRole("img", {
      name: "Vehicle icon: BMW, Car",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Vehicle brand logo: BMW", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "BMW", exact: true }),
  ).toBeVisible();
});
