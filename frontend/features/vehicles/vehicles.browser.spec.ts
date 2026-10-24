import { translate, type Locale } from "@/lib/i18n";
import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import type { SessionUser } from "@/lib/auth/session.types";
import type { Vehicle } from "./vehicles.types";
const choices = [
  {
    manufacturer: "\u0160koda",
    aliases: ["skoda"],
    models: ["Octavia", "Superb", "Fabia", "Kodiaq", "Kamiq", "Karoq"],
  },
  {
    manufacturer: "Toyota",
    aliases: [],
    models: ["Yaris", "Corolla", "Camry", "RAV4", "Hilux"],
  },
  {
    manufacturer: "BMW",
    aliases: [],
    models: ["1 Series", "3 Series", "5 Series", "X1", "X3", "X5"],
  },
  {
    manufacturer: "Hyundai",
    aliases: [],
    models: ["i10", "i20", "Accent", "Elantra", "Tucson"],
  },
];
const driverId = "33333333-3333-4333-8333-333333333333",
  first = "44444444-4444-4444-8444-444444444444",
  second = "55555555-5555-4555-8555-555555555555";
const admin: SessionUser = {
  id: "fleet-admin",
  name: "Fleet Admin",
  email: null,
  role: "COMPANY_ADMIN",
  orgId: "company-a",
  company: { id: "company-a", name: "Fictional Fleet" },
};
let server: Server,
  user: SessionUser,
  vehicles: Vehicle[],
  assigned: string | null,
  status: number,
  delay: number,
  mutationStatus: number,
  disconnect: boolean,
  writes: number;
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const url = new URL(req.url ?? "/", "http://fixture.invalid");
    if (url.pathname === "/auth/session") {
      res.end(JSON.stringify({ success: true, data: user }));
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const writing = req.method !== "GET";
    if (writing) {
      writes++;
      if (disconnect) {
        req.socket.destroy();
        return;
      }
      if (mutationStatus !== 200) {
        res
          .writeHead(mutationStatus)
          .end(JSON.stringify({ message: "private upstream detail" }));
        return;
      }
      if (req.headers["x-fleetora-company-context"] !== user.orgId) {
        res.writeHead(403).end("{}");
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (status !== 200) {
      res.writeHead(status).end("{}");
      return;
    }
    const driver = {
      id: driverId,
      name: "Fictional Driver",
      phone: "+970599000001",
      status: "ACTIVE",
      vehicle: vehicles.find((v) => v.id === assigned) ?? null,
    };
    let data: unknown;
    if (url.pathname.startsWith("/drivers")) {
      if (writing) {
        assigned = body.vehicleId;
        driver.vehicle = vehicles.find((v) => v.id === assigned) ?? null;
      }
      data =
        url.pathname === "/drivers"
          ? {
              companyId: user.orgId,
              items: [driver],
              page: 1,
              pageSize: 20,
              hasNext: false,
            }
          : { companyId: user.orgId, driver };
    } else if (url.pathname.startsWith("/vehicles")) {
      if (req.method === "DELETE") {
        const id = url.pathname.split("/")[2];
        if (!vehicles.some((vehicle) => vehicle.id === id)) {
          res.writeHead(404).end("{}");
          return;
        }
        if (assigned === id) assigned = null;
        vehicles = vehicles.filter((vehicle) => vehicle.id !== id);
        res.writeHead(204).end();
        return;
      }
      if (writing) {
        const id =
          url.pathname.split("/")[2] ?? "66666666-6666-4666-8666-666666666666";
        const item = { id, ...body, assignedDriver: null };
        const index = vehicles.findIndex((v) => v.id === id);
        if (index < 0) vehicles.push(item);
        else vehicles[index] = item;
        data = { companyId: user.orgId, vehicle: item };
      } else {
        const search = (url.searchParams.get("search") ?? "").toLowerCase();
        const page = Number(url.searchParams.get("page") ?? 1);
        let items = user.orgId === "company-a" ? vehicles : [];
        items = items
          .filter((v) =>
            [v.manufacturer, v.model, v.plateNumber]
              .join(" ")
              .toLowerCase()
              .includes(search),
          )
          .filter(
            (v) =>
              url.searchParams.get("unassigned") !== "true" ||
              v.id !== assigned,
          )
          .map((v) => ({
            ...v,
            assignedDriver:
              v.id === assigned
                ? { id: driverId, name: "Fictional Driver" }
                : null,
          }));
        data = {
          companyId: user.orgId,
          catalog: choices,
          items: page === 1 ? items : [],
          page,
          pageSize: 20,
          hasNext: page === 1 && !search,
        };
      }
    } else {
      res.writeHead(404).end("{}");
      return;
    }
    res.end(JSON.stringify({ success: true, data }));
  });
  await new Promise<void>((resolve) =>
    server.listen(3101, "127.0.0.1", resolve),
  );
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test.beforeEach(async ({ context }) => {
  user = admin;
  assigned = null;
  status = 200;
  delay = 0;
  mutationStatus = 200;
  disconnect = false;
  writes = 0;
  vehicles = [
    {
      id: first,
      manufacturer: "Toyota",
      model: "Corolla",
      type: "CAR",
      plateNumber: "TEST-A",
      assignedDriver: null,
    },
    {
      id: second,
      manufacturer: "BMW",
      model: "320i",
      type: "CAR",
      plateNumber: "TEST-B",
      assignedDriver: null,
    },
  ];
  await context.addCookies([
    {
      name: "fleetora_access",
      value: "fixture-access",
      url: "http://localhost:3100",
      httpOnly: true,
    },
  ]);
});
async function catalog(page: Page, locale: Locale = "en") {
  await page.goto("/app/vehicles");
  await expect(
    page.getByRole("main").getByRole("heading", {
      name: translate(locale, "Vehicles"),
      exact: true,
    }),
  ).toBeVisible();
}

test("vehicle deletion requires confirmation, supports cancellation and removes only the selected vehicle", async ({
  page,
}) => {
  await catalog(page);
  await page
    .getByRole("button", { name: "Delete vehicle TEST-A", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Delete vehicle permanently?",
  });
  await expect(dialog).toContainText("TEST-A");
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  expect(writes).toBe(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(writes).toBe(0);
  await expect(
    page.getByRole("button", { name: "Delete vehicle TEST-A", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Delete vehicle TEST-A", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Vehicle deleted successfully." }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Company vehicles" }).getByText("TEST-A"),
  ).toHaveCount(0);
  await expect(page.getByText("TEST-B", { exact: true })).toBeVisible();
  expect(writes).toBe(1);
});

test("assigned vehicle deletion warns about unassignment and refreshes driver data in another tab", async ({
  page,
  context,
}) => {
  assigned = first;
  await page.goto("/app/drivers");
  await page.getByRole("button", { name: "View Fictional Driver" }).click();
  const driver = page.getByRole("dialog", { name: "Driver details" });
  await expect(
    driver.getByText("Toyota Corolla", { exact: true }),
  ).toBeVisible();
  const fleet = await context.newPage();
  await catalog(fleet);
  await fleet
    .getByRole("button", { name: "Delete vehicle TEST-A", exact: true })
    .click();
  const dialog = fleet.getByRole("dialog", {
    name: "Delete vehicle permanently?",
  });
  await expect(dialog).toContainText("Fictional Driver");
  await expect(dialog).toContainText(
    "The vehicle will be unassigned from the driver without deleting the driver.",
  );
  await dialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    driver.getByText("No vehicle assigned", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Drivers", exact: true })
      .getByText("No vehicle assigned"),
  ).toBeVisible();
  expect(assigned).toBeNull();
  expect(writes).toBe(1);
  await fleet.close();
});

test("deletion is keyboard accessible on mobile and prevents duplicate or cancelled pending submissions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await catalog(page);
  const trigger = page.getByRole("button", {
    name: "Delete vehicle TEST-A",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Delete vehicle permanently?",
  });
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(writes).toBe(0);
  await trigger.click();
  delay = 700;
  await dialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Deleting...", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toBeVisible();
  expect(writes).toBe(1);
});

for (const [code, message] of [
  [404, "المركبة غير موجودة أو لم تعد متاحة لشركتك."],
  [409, "تعذر حذف المركبة لوجود ارتباط آخر. حدّث البيانات ثم أعد المحاولة."],
] as const)
  test(`deletion presents a safe Arabic ${code} error`, async ({ page }) => {
    await page
      .context()
      .addCookies([
        { name: "fleetora_locale", value: "ar", url: "http://localhost:3100" },
      ]);
    await catalog(page, "ar");
    await page
      .getByRole("button", { name: "حذف المركبة TEST-A", exact: true })
      .click();
    mutationStatus = code;
    const dialog = page.getByRole("dialog", {
      name: "هل تريد حذف المركبة نهائياً؟",
    });
    await dialog
      .getByRole("button", {
        name: translate("ar", "Delete permanently"),
        exact: true,
      })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(message);
    await expect(dialog).not.toContainText("private upstream");
    expect(writes).toBe(1);
    expect(vehicles).toHaveLength(2);
  });

test("an uncertain deletion is never automatically retried and requires closing and refreshing", async ({
  page,
}) => {
  await catalog(page);
  await page
    .getByRole("button", { name: "Delete vehicle TEST-A", exact: true })
    .click();
  disconnect = true;
  const dialog = page.getByRole("dialog", {
    name: "Delete vehicle permanently?",
  });
  await dialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "We could not confirm the deletion.",
  );
  await expect(
    dialog.getByRole("button", { name: "Delete permanently", exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(1);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("a company change before confirmation vetoes the pending delete", async ({
  page,
}) => {
  await catalog(page);
  await page
    .getByRole("button", { name: "Delete vehicle TEST-A", exact: true })
    .click();
  user = {
    ...admin,
    orgId: "company-b",
    company: { id: "company-b", name: "Other Company" },
  };
  const dialog = page.getByRole("dialog", {
    name: "Delete vehicle permanently?",
  });
  await dialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Your session or company changed.",
  );
  expect(writes).toBe(0);
});
test("catalog displays saved brands, supports mobile and registers/edits vehicles", async ({
  page,
}) => {
  await catalog(page);
  const list = page.getByRole("list", { name: "Company vehicles" });
  await expect(
    list.getByRole("img", { name: "Vehicle brand logo: Toyota" }),
  ).toBeVisible();
  await expect(list.getByText("Toyota Corolla")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Vehicles", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.setViewportSize({ width: 375, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("vehicles-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Register vehicle", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Register vehicle" });
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByLabel("Manufacturer", { exact: true }),
  ).toBeFocused();
  await choose(page, "Manufacturer", "Hyundai");
  await choose(page, "Model", "Other / Custom model");
  await dialog
    .getByLabel("Custom model", { exact: true })
    .fill("Fictional Model");
  await dialog.getByLabel("License plate").fill("TEST-C");
  await dialog
    .getByRole("button", { name: "Register vehicle", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Vehicle saved." }),
  ).toBeVisible();
  await expect(list.getByText("Hyundai Fictional Model")).toBeVisible();
  await page.getByRole("button", { name: "Edit TEST-C" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Custom model", { exact: true })
    .fill("Updated Model");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(list.getByText("Hyundai Updated Model")).toBeVisible();
  expect(writes).toBe(2);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: test.info().outputPath("vehicles-desktop.png"),
    fullPage: true,
  });
});
test("catalog search, pagination, loading, empty and retry states", async ({
  page,
}) => {
  delay = 600;
  await catalog(page);
  await expect(
    page.getByRole("status").filter({ hasText: "Loading vehicles" }),
  ).toBeVisible();
  await expect(page.getByText("Toyota Corolla")).toBeVisible();
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page.getByText("No vehicles on this page.")).toBeVisible();
  await page.getByRole("link", { name: "Previous" }).click();
  await expect(page).toHaveURL(/\/app\/vehicles$/);
  await page
    .getByRole("searchbox", { name: "Search vehicles" })
    .fill("missing");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No vehicles match your search.")).toBeVisible();
  status = 503;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "could not be loaded",
  );
  status = 200;
  delay = 0;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No vehicles match your search.")).toBeVisible();
});
test("assigns, confirms replacement, cancels replacement and unassigns with card refresh", async ({
  page,
}) => {
  await page.goto("/app/drivers");
  await page.getByRole("button", { name: "View Fictional Driver" }).click();
  const dialog = page.getByRole("dialog", { name: "Driver details" });
  await dialog
    .getByRole("button", { name: "Assign vehicle", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Toyota Corolla TEST-A" }).click();
  expect(writes).toBe(0);
  await dialog.getByRole("button", { name: "Confirm assignment" }).click();
  await expect(
    dialog.getByText("Toyota Corolla", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("img", { name: "Vehicle brand logo: Toyota" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Change vehicle" }).click();
  await dialog
    .getByRole("searchbox", { name: "Search available vehicles" })
    .fill("BMW");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await dialog.getByRole("button", { name: "BMW 320i TEST-B" }).click();
  await expect(dialog.getByText("Replace the assigned vehicle?")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes).toBe(1);
  await expect(
    dialog.getByText("Toyota Corolla", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Change vehicle" }).click();
  await dialog.getByRole("button", { name: "BMW 320i TEST-B" }).click();
  await dialog.getByRole("button", { name: "Confirm assignment" }).click();
  await expect(
    dialog.getByRole("img", { name: "Vehicle brand logo: BMW" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Unassign vehicle", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Confirm unassignment" }).click();
  await expect(
    dialog.getByText("No vehicle assigned", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close details" }).click();
  await expect(
    page
      .getByRole("list", { name: "Drivers", exact: true })
      .getByText("No vehicle assigned"),
  ).toBeVisible();
  expect(writes).toBe(3);
});
test("reports duplicate plates and uncertain writes without replay", async ({
  page,
}) => {
  await catalog(page);
  await page.getByRole("button", { name: "Edit TEST-A" }).click();
  mutationStatus = 409;
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "already in use",
  );
  expect(writes).toBe(1);
  mutationStatus = 200;
  disconnect = true;
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "could not confirm",
  );
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  expect(writes).toBe(2);
});
for (const role of ["PLATFORM_ADMIN", "MERCHANT", "ACCOUNTANT"] as const)
  test(`denies ${role} vehicles access`, async ({ page }) => {
    user =
      role === "PLATFORM_ADMIN"
        ? { ...admin, role, orgId: null, company: null }
        : { ...admin, role };
    await page.goto("/app/vehicles");
    await expect(
      page.getByRole("link", { name: "Vehicles", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Register vehicle" }),
    ).toHaveCount(0);
    expect(writes).toBe(0);
  });
test("redirects missing session and drops old-company catalog on identity change", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.goto("/app/vehicles");
  await expect(page).toHaveURL(/\/login$/);
  await context.addCookies([
    {
      name: "fleetora_access",
      value: "fixture-access",
      url: "http://localhost:3100",
      httpOnly: true,
    },
  ]);
  await catalog(page);
  await expect(page.getByText("Toyota Corolla")).toBeVisible();
  user = {
    ...admin,
    orgId: "company-b",
    company: { id: "company-b", name: "Another Company" },
  };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByTitle("Another Company", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Toyota Corolla")).toHaveCount(0);
});

test("shows legacy and unknown manufacturer fallbacks from saved fields", async ({
  page,
}) => {
  vehicles[0] = {
    ...vehicles[0],
    manufacturer: null,
    model: null,
    type: "MOTORCYCLE",
  };
  vehicles[1] = {
    ...vehicles[1],
    manufacturer: "Fictional Motors",
    model: null,
  };
  await catalog(page);
  const list = page.getByRole("list", { name: "Company vehicles" });
  await expect(
    list.getByRole("img", {
      name: "Vehicle type icon: Motorcycle",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    list.getByRole("heading", { name: "Fictional Motors", exact: true }),
  ).toBeVisible();
  await expect(
    list.getByRole("img", {
      name: "Vehicle icon: Fictional Motors, Car",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    list.getByRole("img", { name: /^Vehicle brand logo:/ }),
  ).toHaveCount(0);
});
test("reports assignment conflicts, preserves the current vehicle and refreshes without replay", async ({
  page,
}) => {
  assigned = first;
  await page.goto("/app/drivers");
  await page.getByRole("button", { name: "View Fictional Driver" }).click();
  const dialog = page.getByRole("dialog", { name: "Driver details" });
  await dialog.getByRole("button", { name: "Change vehicle" }).click();
  await dialog.getByRole("button", { name: "BMW 320i TEST-B" }).click();
  mutationStatus = 409;
  await dialog.getByRole("button", { name: "Confirm assignment" }).click();
  await expect(dialog.getByRole("alert")).toContainText("already in use");
  await expect(
    dialog.getByRole("button", { name: "Confirm assignment" }),
  ).toBeDisabled();
  expect(assigned).toBe(first);
  expect(writes).toBe(1);
  await dialog.getByRole("button", { name: "Refresh driver" }).click();
  await expect(
    dialog.getByText("Toyota Corolla", { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
});

async function choose(page: Page, label: string, option: string) {
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: label, exact: true })
    .click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("dependent searchable options clear stale models and submit the selected pair", async ({
  page,
}) => {
  await catalog(page);
  await page.getByRole("button", { name: "Edit TEST-A" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", { name: "Manufacturer", exact: true }),
  ).toHaveText(/Toyota/);
  await expect(
    dialog.getByRole("combobox", { name: "Model", exact: true }),
  ).toHaveText(/Corolla/);
  await dialog
    .getByRole("combobox", { name: "Manufacturer", exact: true })
    .click();
  await dialog
    .getByRole("searchbox", { name: "Search manufacturer" })
    .fill("skoda");
  await expect(
    dialog.getByRole("option", { name: "Toyota", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(
    dialog.getByRole("combobox", { name: "Manufacturer", exact: true }),
  ).toHaveText(/koda/);
  await expect(
    dialog.getByRole("combobox", { name: "Model", exact: true }),
  ).toHaveText(/Not recorded/);
  await dialog.getByRole("combobox", { name: "Model", exact: true }).click();
  for (const name of choices[0].models)
    await expect(
      dialog.getByRole("option", { name, exact: true }),
    ).toBeVisible();
  await expect(
    dialog.getByRole("option", { name: "Corolla", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("searchbox", { name: "Search model" }).fill("super");
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  expect(vehicles[0]).toMatchObject({
    manufacturer: "\u0160koda",
    model: "Superb",
  });
});

test("optional empty values keep model disabled and submit nulls", async ({
  page,
}) => {
  await catalog(page);
  await page
    .getByRole("button", { name: "Register vehicle", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", { name: "Model", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("License plate").fill("EMPTY");
  await dialog
    .getByRole("button", { name: "Register vehicle", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(vehicles.at(-1)).toMatchObject({ manufacturer: null, model: null });
});

test("changing manufacturer submits no stale model and choosing none disables model", async ({
  page,
}) => {
  await catalog(page);
  await page.getByRole("button", { name: "Edit TEST-A" }).click();
  await choose(page, "Manufacturer", "BMW");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "Model", exact: true }),
  ).toHaveText(/Not recorded/);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(vehicles[0]).toMatchObject({ manufacturer: "BMW", model: null });
  await page.getByRole("button", { name: "Edit TEST-A" }).click();
  await choose(page, "Manufacturer", "Not recorded");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "Model", exact: true }),
  ).toBeDisabled();
});

test("custom values are explicit, required and preserved on edit", async ({
  page,
}) => {
  await catalog(page);
  await page
    .getByRole("button", { name: "Register vehicle", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await choose(page, "Manufacturer", "Other / Custom manufacturer");
  await dialog.getByLabel("License plate").fill("CUSTOM");
  await dialog
    .getByRole("button", { name: "Register vehicle", exact: true })
    .click();
  expect(writes).toBe(0);
  await dialog
    .getByLabel("Custom manufacturer", { exact: true })
    .fill("Fictional Motors");
  await choose(page, "Model", "Other / Custom model");
  await dialog.getByLabel("Custom model", { exact: true }).fill("  ");
  await dialog
    .getByRole("button", { name: "Register vehicle", exact: true })
    .click();
  expect(writes).toBe(0);
  await dialog.getByLabel("Custom model", { exact: true }).fill("Demo Shuttle");
  await dialog
    .getByRole("button", { name: "Register vehicle", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(vehicles.at(-1)).toMatchObject({
    manufacturer: "Fictional Motors",
    model: "Demo Shuttle",
  });
  await page.getByRole("button", { name: "Edit CUSTOM" }).click();
  await expect(
    dialog.getByLabel("Custom manufacturer", { exact: true }),
  ).toHaveValue("Fictional Motors");
  await expect(dialog.getByLabel("Custom model", { exact: true })).toHaveValue(
    "Demo Shuttle",
  );
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  expect(vehicles.at(-1)).toMatchObject({
    manufacturer: "Fictional Motors",
    model: "Demo Shuttle",
  });
});

test("legacy model without manufacturer and mismatched pair survive unrelated edits", async ({
  page,
}) => {
  vehicles[0] = { ...vehicles[0], manufacturer: null, model: "Legacy Special" };
  vehicles[1] = { ...vehicles[1], manufacturer: "BMW", model: "Corolla" };
  await catalog(page);
  for (const plate of ["TEST-A", "TEST-B"]) {
    await page.getByRole("button", { name: `Edit ${plate}` }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("combobox", { name: "Model", exact: true }),
    ).toBeEnabled();
    await dialog.getByLabel("Vehicle type").selectOption("VAN");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).not.toBeVisible();
  }
  expect(vehicles[0]).toMatchObject({
    manufacturer: null,
    model: "Legacy Special",
    type: "VAN",
  });
  expect(vehicles[1]).toMatchObject({
    manufacturer: "BMW",
    model: "Corolla",
    type: "VAN",
  });
});

test("existing custom inputs remain mounted while clearing and replacing values", async ({
  page,
}) => {
  vehicles[0] = {
    ...vehicles[0],
    manufacturer: "Fictional Motors",
    model: "Corolla Sport",
  };
  await catalog(page);
  await page.getByRole("button", { name: "Edit TEST-A" }).click();
  const dialog = page.getByRole("dialog");
  // Existing custom models must survive clearing before their replacement is typed.
  await dialog.getByLabel("Custom model", { exact: true }).fill("");
  await expect(
    dialog.getByLabel("Custom model", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByLabel("Custom model", { exact: true })
    .fill("Legacy Replacement");
  const manufacturer = dialog.getByLabel("Custom manufacturer", {
    exact: true,
  });
  await manufacturer.fill("");
  await expect(manufacturer).toBeVisible();
  await manufacturer.fill("Toyota");
  await expect(manufacturer).toBeVisible();
  await choose(page, "Model", "Other / Custom model");
  const model = dialog.getByLabel("Custom model", { exact: true });
  await model.fill("Corolla Sport");
  await model.fill("");
  await expect(model).toBeVisible();
  await model.fill("Corolla");
  await expect(model).toBeVisible();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  expect(vehicles[0]).toMatchObject({
    manufacturer: "Toyota",
    model: "Corolla",
  });
});

test("blank legacy identity does not block an unrelated edit", async ({
  page,
}) => {
  vehicles[0] = { ...vehicles[0], manufacturer: "  ", model: "  " };
  await catalog(page);
  await page.getByRole("button", { name: "Edit TEST-A" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", { name: "Manufacturer", exact: true }),
  ).toHaveText(/Not recorded/);
  await expect(
    dialog.getByRole("combobox", { name: "Model", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("Vehicle type").selectOption("VAN");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  expect(vehicles[0].type).toBe("VAN");
});

test("mobile keyboard selection, escape and dark-mode colors remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "dark" });
  await catalog(page);
  await page.getByRole("button", { name: "Edit TEST-A" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCSS("background-color", "rgb(11, 31, 51)");

  await dialog
    .getByRole("combobox", { name: "Manufacturer", exact: true })
    .focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    dialog.getByRole("searchbox", { name: "Search manufacturer" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("combobox", { name: "Manufacturer", exact: true }),
  ).toBeFocused();
  await dialog.getByRole("combobox", { name: "Model", exact: true }).click();
  await dialog.getByRole("searchbox", { name: "Search model" }).fill("rav");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(
    dialog.getByRole("combobox", { name: "Model", exact: true }),
  ).toHaveText(/RAV4/);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("dependent-model-mobile-dark.png"),
    fullPage: true,
  });
  expect(writes).toBe(0);
});
