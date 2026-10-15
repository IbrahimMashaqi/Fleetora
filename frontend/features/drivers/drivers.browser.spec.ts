import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import type { SessionUser } from "@/lib/auth/session.types";
import { contrastRatio } from "@/tests/ui-assertions";

const admin: SessionUser = {
  id: "directory-admin",
  name: "Directory Admin",
  email: null,
  role: "COMPANY_ADMIN",
  orgId: "company-a",
  company: { id: "company-a", name: "Directory Logistics" },
};
const driver = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Amina Driver",
  phone: "+970599000001",
  status: "ACTIVE",
};
let server: Server;
let user: SessionUser;
let status: number;
let empty: boolean;
let delay: number;
let requests: URL[];
let driverName: string;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/auth/session") {
      response.end(JSON.stringify({ success: true, data: user }));
      return;
    }
    if (request.url === "/auth/logout") {
      response.end(
        JSON.stringify({ success: true, data: { message: "Logged out" } }),
      );
      return;
    }
    const url = new URL(request.url ?? "/", "http://fixture.invalid");
    if (!url.pathname.startsWith("/drivers") || request.method !== "GET") {
      response.writeHead(500).end();
      return;
    }
    requests.push(url);
    const requestUser = user;
    const record = { ...driver, name: driverName };
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (status !== 200) {
      response
        .writeHead(status)
        .end(JSON.stringify({ message: "private upstream detail" }));
      return;
    }
    const page = Number(url.searchParams.get("page") ?? 1);
    const data =
      url.pathname === "/drivers"
        ? {
            companyId: requestUser.orgId,
            items:
              empty || url.searchParams.get("search") === "missing"
                ? []
                : [
                    {
                      ...record,
                      name: page > 1 ? "Second Page Driver" : record.name,
                    },
                  ],
            page,
            pageSize: 20,
            hasNext: page === 1 && !empty && !url.searchParams.get("search"),
          }
        : { companyId: requestUser.orgId, driver: record };
    response.end(JSON.stringify({ success: true, data }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3101, "127.0.0.1", resolve);
  });
});
test.beforeEach(async ({ context }) => {
  user = admin;
  status = 200;
  empty = false;
  delay = 0;
  requests = [];
  driverName = driver.name;
  await context.addCookies([
    {
      name: "fleetora_access",
      value: "fixture-driver-access",
      url: "http://localhost:3100",
      httpOnly: true,
    },
    {
      name: "fleetora_refresh",
      value: "fixture-driver-refresh",
      url: "http://localhost:3100",
      httpOnly: true,
    },
  ]);
});
test.afterAll(async () => {
  if (server?.listening)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

async function directory(page: Page) {
  await page.goto("/app/drivers");
  await expect(
    page
      .getByRole("main")
      .getByRole("heading", { name: "Drivers", exact: true }),
  ).toBeVisible();
}

test("shows driver rows and Company Admin navigation", async ({ page }) => {
  await page.goto("/app");
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Drivers", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/drivers$/);
  await expect(
    page.getByRole("main").getByText("Amina Driver", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Drivers", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  expect(requests.every((url) => !url.searchParams.has("companyId"))).toBe(
    true,
  );
  await expect(page.getByRole("button", { name: /add driver/i })).toHaveCount(
    0,
  );
});
test("supports backend search, URL pagination, and detail lookup", async ({
  page,
}) => {
  await directory(page);
  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(
    page
      .getByRole("main")
      .getByText("Second Page Driver", { exact: true })
      .first(),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Search drivers" }).fill("Amina");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/search=Amina/);
  await expect(
    page.getByRole("main").getByText("Amina Driver", { exact: true }).first(),
  ).toBeVisible();
  const view = page.getByRole("button", {
    name: "View Amina Driver",
    exact: true,
  });
  await view.first().click();
  const dialog = page.getByRole("dialog", { name: "Driver details" });
  await expect(
    dialog.getByText("+970599000001", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close details" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(view.first()).toBeFocused();
  expect(requests.some((url) => url.pathname === `/drivers/${driver.id}`)).toBe(
    true,
  );
  await page.getByRole("searchbox", { name: "Search drivers" }).fill("missing");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByText("No drivers match your search.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Clear search", exact: true }).click();
  await expect(
    page.getByRole("main").getByText("Amina Driver", { exact: true }).first(),
  ).toBeVisible();
});
test("shows loading, empty, and safe retry states", async ({ page }) => {
  delay = 700;
  empty = true;
  await directory(page);
  await expect(
    page.getByRole("status").filter({ hasText: "Loading drivers" }),
  ).toBeVisible();
  await expect(
    page.getByText("No drivers yet.", { exact: true }),
  ).toBeVisible();
  status = 503;
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "couldn’t load drivers",
  );
  await expect(page.locator("body")).not.toContainText(
    "private upstream detail",
  );
  status = 200;
  empty = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("main").getByText("Amina Driver", { exact: true }).first(),
  ).toBeVisible();
});
for (const role of ["PLATFORM_ADMIN", "MERCHANT", "ACCOUNTANT"] as const) {
  test(`denies ${role} directory entry and hides operational navigation`, async ({
    page,
  }) => {
    user = {
      ...admin,
      role,
      ...(role === "PLATFORM_ADMIN" ? { orgId: null, company: null } : {}),
    };
    await page.goto("/app/drivers");
    await expect(
      page.getByRole("heading", {
        name: "Company administrator access required",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Drivers", exact: true }),
    ).toHaveCount(0);
    expect(requests).toHaveLength(0);
  });
}
test("redirects missing credentials and removes stale tenant data after identity change", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.goto("/app/drivers");
  await expect(page).toHaveURL(/\/login$/);
  await context.addCookies([
    {
      name: "fleetora_access",
      value: "fixture-driver-access",
      url: "http://localhost:3100",
      httpOnly: true,
    },
  ]);
  await directory(page);
  await expect(
    page.getByRole("main").getByText("Amina Driver", { exact: true }).first(),
  ).toBeVisible();
  user = { ...admin, role: "PLATFORM_ADMIN", orgId: null, company: null };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", {
      name: "Company administrator access required",
    }),
  ).toBeVisible();
  await expect(page.getByText("Amina Driver")).toHaveCount(0);
});
test("handles API authentication rejection without retaining driver data", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  status = 401;
  await page.goto("/app/drivers");
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (await context.cookies()).filter((cookie) =>
      ["fleetora_access", "fleetora_refresh"].includes(cookie.name),
    ),
  ).toHaveLength(0);
  await expect(page.getByText("Amina Driver")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("keeps mobile layout, navigation, and details usable", async ({
  page,
}) => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await directory(page);
    await expect(
      page.getByRole("main").getByText("Amina Driver", { exact: true }).first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: test.info().outputPath("drivers-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: test.info().outputPath("drivers-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "View Amina Driver", exact: true })
    .click();
  const details = page.getByRole("dialog", { name: "Driver details" });
  await expect(
    details.getByText("+970599000001", { exact: true }),
  ).toBeVisible();
  expect(
    await details.evaluate(
      (element) => element.getBoundingClientRect().width <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Mobile navigation" });
  await expect(
    dialog.getByRole("link", { name: "Drivers", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("link", { name: "Account & security" }).click();
  await expect(
    page.getByRole("heading", { name: "Your account" }),
  ).toBeVisible();
});

test("discards a delayed old-company read after the same admin changes company", async ({
  page,
}) => {
  delay = 800;
  await directory(page);
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  user = {
    ...admin,
    orgId: "company-b",
    company: { id: "company-b", name: "Company B" },
  };
  driverName = "Company B Driver";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("main").getByText("Company B Driver", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Amina Driver", { exact: true })).toHaveCount(0);
  await expect(page.getByTitle("Company B", { exact: true })).toBeVisible();
});

test("clears driver details on cross-tab invalidation and logout", async ({
  page,
  context,
}) => {
  await directory(page);
  await page.getByRole("button", { name: "View Amina Driver" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Driver details" })
      .getByText("+970599000001"),
  ).toBeVisible();
  user = {
    ...admin,
    id: "another-admin",
    orgId: "company-b",
    company: { id: "company-b", name: "Company B" },
  };
  driverName = "New Session Driver";
  await page.evaluate(() => {
    const channel = new BroadcastChannel("fleetora-session");
    channel.postMessage("session-invalidated");
    channel.close();
  });
  await expect(
    page.getByText("New Session Driver", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Driver details" }),
  ).toHaveCount(0);
  await expect(page.getByText("Amina Driver", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("New Session Driver")).toHaveCount(0);
  expect(
    (await context.cookies()).filter((cookie) =>
      ["fleetora_access", "fleetora_refresh"].includes(cookie.name),
    ),
  ).toHaveLength(0);
});

test("keeps long driver names within the mobile viewport", async ({ page }) => {
  driverName = "A".repeat(180);
  await page.setViewportSize({ width: 320, height: 812 });
  await directory(page);
  await expect(
    page.getByRole("main").getByText(driverName, { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: `View ${driverName}`, exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText(driverName, { exact: true }),
  ).toBeVisible();
});

for (const code of [404, 503, 403]) {
  test(`handles detail rejection ${code} safely`, async ({ page }) => {
    await directory(page);
    await expect(
      page.getByRole("main").getByText("Amina Driver", { exact: true }),
    ).toBeVisible();
    status = code;
    await page
      .getByRole("button", { name: "View Amina Driver", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Driver details" });
    if (code === 403)
      await expect(
        dialog.getByRole("heading", {
          name: "Company administrator access required",
        }),
      ).toBeVisible();
    else await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog).not.toContainText("private upstream detail");
    await expect(
      dialog.getByText("+970599000001", { exact: true }),
    ).toHaveCount(0);
    if (code === 503) {
      status = 200;
      await dialog.getByRole("button", { name: "Try again" }).click();
      await expect(
        dialog.getByText("+970599000001", { exact: true }),
      ).toBeVisible();
    }
  });
}

test("validates URL parameters and recovers without sending an invalid API query", async ({
  page,
}) => {
  await page.goto("/app/drivers?page=abc");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Check the search and page values",
  );
  expect(requests).toHaveLength(0);
  await page.getByRole("link", { name: "Reset search" }).click();
  await expect(
    page.getByRole("main").getByText("Amina Driver", { exact: true }),
  ).toBeVisible();
});

test("provides labeled keyboard controls and readable text contrast", async ({
  page,
}) => {
  await directory(page);
  const main = page.getByRole("main");
  await expect(main.getByText("Amina Driver", { exact: true })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search drivers" });
  await search.focus();
  await expect(search).toBeFocused();
  await page.keyboard.press("Tab");
  const submit = page.getByRole("button", { name: "Search", exact: true });
  await expect(submit).toBeFocused();
  for (const target of [
    submit,
    main.getByText("+970599000001", { exact: true }),
    main.getByText("Active", { exact: true }),
  ]) {
    expect(await contrastRatio(target)).toBeGreaterThanOrEqual(4.5);
  }
  await page.getByRole("button", { name: "View Amina Driver" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Driver details" });
  await expect(
    dialog.getByRole("button", { name: "Close details" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  // Native dialogs can send Tab to browser chrome when they have one control.
  // The page behind the modal must remain inaccessible, and reverse Tab returns.
  await expect(search).not.toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Close details" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "View Amina Driver" }),
  ).toBeFocused();
});
