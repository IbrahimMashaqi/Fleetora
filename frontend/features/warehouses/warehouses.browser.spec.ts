import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import type { SessionUser } from "@/lib/auth/session.types";
import type { Warehouse } from "./warehouses.types";

const admin: SessionUser = {
  id: "warehouse-admin",
  name: "Warehouse Admin",
  email: null,
  role: "COMPANY_ADMIN",
  orgId: "company-a",
  company: { id: "company-a", name: "Warehouse Logistics", currency: "ILS" },
};
const hub: Warehouse = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Main Hub",
  address: "Fictional industrial zone 4",
  archived: false,
};
let server: Server;
let user: SessionUser;
let store: Warehouse[];
let openPickups: boolean;
let writes: {
  method: string;
  path: string;
  context: string | string[] | undefined;
  body: Record<string, unknown>;
}[];

function reply(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
) {
  response.writeHead(status).end(JSON.stringify(body));
}

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/auth/session")
      return reply(response, 200, { success: true, data: user });
    const url = new URL(request.url ?? "/", "http://fixture.invalid");
    if (!url.pathname.startsWith("/warehouses")) return reply(response, 500, {});
    if (request.method === "GET") {
      const archived = url.searchParams.get("status") === "ARCHIVED";
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      return reply(response, 200, {
        success: true,
        data: {
          companyId: user.orgId,
          items: store.filter(
            (item) =>
              item.archived === archived &&
              `${item.name} ${item.address}`.toLowerCase().includes(search),
          ),
          page: Number(url.searchParams.get("page") ?? 1),
          pageSize: 20,
          hasNext: false,
        },
      });
    }
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw || "{}") as Record<string, unknown>;
    writes.push({
      method: request.method ?? "",
      path: url.pathname,
      context: request.headers["x-fleetora-company-context"],
      body,
    });
    const id = url.pathname.split("/")[2];
    let record: Warehouse | undefined;
    if (request.method === "POST") {
      record = {
        id: "66666666-6666-4666-8666-666666666666",
        name: String(body.name),
        address: String(body.address),
        archived: false,
      };
      store.push(record);
    } else {
      const index = store.findIndex((item) => item.id === id);
      if (index < 0) return reply(response, 404, { message: "missing" });
      if (request.method === "PUT" && body.archived && openPickups)
        return reply(response, 409, { message: "open pickups" });
      store[index] =
        request.method === "PATCH"
          ? { ...store[index], name: String(body.name), address: String(body.address) }
          : { ...store[index], archived: Boolean(body.archived) };
      record = store[index];
    }
    reply(response, request.method === "POST" ? 201 : 200, {
      success: true,
      data: { companyId: user.orgId, warehouse: record },
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3101, "127.0.0.1", resolve);
  });
});
test.beforeEach(async ({ context }) => {
  user = admin;
  store = [{ ...hub }];
  openPickups = false;
  writes = [];
  await context.addCookies(
    ["fleetora_access", "fleetora_refresh"].map((name) => ({
      name,
      value: `fixture-${name}`,
      url: "http://localhost:3100",
      httpOnly: true,
    })),
  );
});
test.afterAll(async () => {
  if (server?.listening)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

async function directory(page: Page, path = "/app/warehouses") {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 2, name: "Warehouses" }),
  ).toBeVisible();
}
const card = (page: Page, name: string) =>
  page.getByRole("article", { name });

test("lists active warehouses and is reachable from the navigation", async ({ page }) => {
  await directory(page);
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Warehouses" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(card(page, "Main Hub")).toContainText("Fictional industrial zone 4");
  await expect(
    page.getByRole("link", { name: "Active" }),
  ).toHaveAttribute("aria-current", "page");
});

test("adds a warehouse with validation feedback and the company context", async ({ page }) => {
  await directory(page);
  await page.getByRole("button", { name: "Add warehouse" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add warehouse" });
  await expect(dialog.getByLabel("Warehouse name")).toBeFocused();
  await dialog.getByLabel("Warehouse name").fill("N");
  await dialog.getByLabel("Address").fill("Fictional north road 2");
  await dialog.getByRole("button", { name: "Add warehouse" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Check the warehouse name and address, then try again.",
  );
  expect(writes).toEqual([]);
  await dialog.getByLabel("Warehouse name").fill("  North   Depot ");
  await dialog.getByRole("button", { name: "Add warehouse" }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, "North Depot")).toBeVisible();
  expect(writes).toEqual([
    {
      method: "POST",
      path: "/warehouses",
      context: "company-a",
      body: { name: "North Depot", address: "Fictional north road 2" },
    },
  ]);
});

test("edits an existing warehouse", async ({ page }) => {
  await directory(page);
  await page.getByRole("button", { name: "Edit Main Hub" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit warehouse" });
  await expect(dialog.getByLabel("Address")).toHaveValue(hub.address);
  await dialog.getByLabel("Warehouse name").fill("Central Hub");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, "Central Hub")).toBeVisible();
  expect(writes[0]).toMatchObject({
    method: "PATCH",
    path: `/warehouses/${hub.id}`,
    body: { name: "Central Hub", address: hub.address },
  });
});

test("explains why a warehouse with open pickups cannot be archived", async ({ page }) => {
  openPickups = true;
  await directory(page);
  await page.getByRole("button", { name: "Archive Main Hub" }).click();
  await page.getByRole("button", { name: "Confirm archive" }).click();
  await expect(card(page, "Main Hub").getByRole("alert")).toHaveText(
    "This warehouse has open pickup requests. Complete or cancel them before archiving.",
  );
  await expect(card(page, "Main Hub")).toBeVisible();
});

test("archives after confirmation, then restores from the archived tab", async ({ page }) => {
  await directory(page);
  await page.getByRole("button", { name: "Archive Main Hub" }).click();
  await page.getByRole("button", { name: "Keep warehouse" }).click();
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Archive Main Hub" }).click();
  await page.getByRole("button", { name: "Confirm archive" }).click();
  await expect(page.getByRole("heading", { name: "No warehouses yet." })).toBeVisible();

  await page.getByRole("link", { name: "Archived" }).click();
  await expect(page).toHaveURL(/status=archived/);
  const archived = card(page, "Main Hub");
  await expect(archived).toContainText("Archived");
  await expect(archived.getByRole("button", { name: /^Edit/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Restore Main Hub" }).click();
  await expect(page.getByRole("heading", { name: "No archived warehouses." })).toBeVisible();
  expect(writes.map(({ method, body }) => [method, body])).toEqual([
    ["PUT", { archived: true }],
    ["PUT", { archived: false }],
  ]);
});

test("denies non company-admin users without loading warehouses", async ({ page }) => {
  user = { ...admin, role: "MERCHANT" };
  await page.goto("/app/warehouses");
  await expect(
    page.getByRole("heading", { name: "Company administrator access required" }),
  ).toBeVisible();
});

test("fits a small screen without page-wide horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  store = [{ ...hub, name: "A very long warehouse name ".repeat(4).trim() }];
  await page.goto("/app/warehouses");
  await expect(page.getByRole("list", { name: "Warehouses" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
