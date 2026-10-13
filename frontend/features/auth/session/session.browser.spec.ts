import { expect, test } from "@playwright/test";

const user = { id: "lifecycle-user", name: "Lifecycle Reader", email: null, role: "COMPANY_ADMIN", orgId: "lifecycle-company", company: { id: "lifecycle-company", name: "Lifecycle Company" } };

test("offers explicit sign-in recovery after an ambiguous refresh rejection", async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "Session changed" }) }));
  await page.goto("/app");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await page.getByRole("link", { name: "Sign in again" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("supports local session recovery when browser coordination APIs are absent", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
    Object.defineProperty(window, "BroadcastChannel", { value: undefined, configurable: true });
  });
  await page.route("**/api/auth/session", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user }) }));
  await page.goto("/app");
  await expect(page.getByText("Lifecycle Reader").first()).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Lifecycle Reader")).toHaveCount(0);
});

test("bootstraps direct entry and reload exactly once without duplicating the protected shell", async ({ page }) => {
  const requests: { method: string; body: string | null }[] = [];
  await page.route("**/api/auth/session", route => {
    requests.push({ method: route.request().method(), body: route.request().postData() });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user }) });
  });
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
  expect(requests).toEqual([{ method: "POST", body: "{}" }]);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("complementary", { name: "Workspace sidebar" })).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
  expect(requests).toEqual([{ method: "POST", body: "{}" }, { method: "POST", body: "{}" }]);
});

test("coalesces focus and reconnect events while one session check is pending", async ({ page }) => {
  let calls = 0;
  let rechecking = false;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/auth/session", async route => {
    calls++;
    if (rechecking) await pending;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: rechecking ? { ...user, name: "Revalidated Reader" } : user }) });
  });
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
  expect(calls).toBe(1);
  rechecking = true;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
  });
  await expect.poll(() => calls).toBe(2);
  release();
  await expect(page.getByText("Revalidated Reader").first()).toBeVisible();
  expect(calls).toBe(2);
});

test("invalidates identity when focus revalidation confirms session expiry", async ({ page }) => {
  let expired = false;
  await page.route("**/api/auth/session", route => route.fulfill({ status: expired ? 401 : 200, contentType: "application/json", body: JSON.stringify(expired ? { message: "Sign in again" } : { user }) }));
  await page.goto("/app");
  await expect(page.getByText("Lifecycle Reader").first()).toBeVisible();
  expired = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Lifecycle Reader")).toHaveCount(0);
});

for (const failure of ["service", "network"] as const) {
  test(`recovers after a ${failure} failure when connectivity returns`, async ({ page }) => {
    let unavailable = false;
    await page.route("**/api/auth/session", route => unavailable
      ? failure === "network" ? route.abort("failed") : route.fulfill({ status: 503, body: "Service unavailable" })
      : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user }) }));
    await page.goto("/app");
    await expect(page.getByText("Lifecycle Reader").first()).toBeVisible();
    unavailable = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("heading", { name: "We couldn’t verify your session" })).toBeVisible();
    await expect(page.getByText("Lifecycle Reader")).toHaveCount(0);
    unavailable = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByRole("heading", { name: "Welcome to Fleetora" })).toBeVisible();
    await expect(page.getByText("Lifecycle Reader").first()).toBeVisible();
  });
}

test("hides identity and offers recovery when the logout action request fails", async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user }) }));
  await page.goto("/app");
  await expect(page.getByText("Lifecycle Reader").first()).toBeVisible();
  await page.route("**/app", route => route.request().method() === "POST" ? route.abort("failed") : route.continue());
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "We couldn’t verify your session" })).toBeVisible();
  await expect(page.getByText("Lifecycle Reader")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Lifecycle Reader").first()).toBeVisible();
});

test("keeps local logout usable when cross-tab messaging is unavailable", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "BroadcastChannel", { value: undefined }));
  await page.route("**/api/auth/session", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user }) }));
  await page.goto("/app");
  await expect(page.getByText("Lifecycle Reader").first()).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Lifecycle Reader")).toHaveCount(0);
});
