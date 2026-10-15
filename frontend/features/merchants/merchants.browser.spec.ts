import { createServer, type Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';
import type { SessionUser } from '@/lib/auth/session.types';

const admin: SessionUser = { id: 'directory-admin', name: 'Directory Admin', email: null, role: 'COMPANY_ADMIN', orgId: 'company-a', company: { id: 'company-a', name: 'Directory Logistics' } };
const merchant = { id: '33333333-3333-4333-8333-333333333333', name: 'Alpha Supplies', email: 'alpha@example.invalid', isActive: true, isEmailVerified: true };
let server: Server;
let user: SessionUser;
let status: number;
let empty: boolean;
let delay: number;
let requests: URL[];

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/auth/session') { response.end(JSON.stringify({ success: true, data: user })); return; }
    if (request.url === '/auth/logout') { response.end(JSON.stringify({ success: true, data: { message: 'Logged out' } })); return; }
    const url = new URL(request.url ?? '/', 'http://fixture.invalid');
    if (!url.pathname.startsWith('/merchants') || request.method !== 'GET') { response.writeHead(500).end(); return; }
    requests.push(url);
    await new Promise(resolve => setTimeout(resolve, delay));
    if (status !== 200) { response.writeHead(status).end(JSON.stringify({ message: 'private upstream detail' })); return; }
    const page = Number(url.searchParams.get('page') ?? 1);
    const data = url.pathname === '/merchants'
      ? { companyId: user.orgId, items: empty || url.searchParams.get('search') === 'missing' ? [] : [{ ...merchant, name: page > 1 ? 'Second Page Merchant' : merchant.name }], page, pageSize: 20, hasNext: page === 1 && !empty && !url.searchParams.get('search') }
      : { companyId: user.orgId, account: merchant };
    response.end(JSON.stringify({ success: true, data }));
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(3101, '127.0.0.1', resolve); });
});
test.beforeEach(async ({ context }) => {
  user = admin; status = 200; empty = false; delay = 0; requests = [];
  await context.addCookies([
    { name: 'fleetora_access', value: 'fixture-merchant-access', url: 'http://localhost:3100', httpOnly: true },
    { name: 'fleetora_refresh', value: 'fixture-merchant-refresh', url: 'http://localhost:3100', httpOnly: true },
  ]);
});
test.afterAll(async () => { if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

async function directory(page: Page) { await page.goto('/app/merchants'); await expect(page.getByRole('heading', { name: 'Merchant accounts', exact: true })).toBeVisible(); }

test('shows real account rows and Company Admin navigation', async ({ page }) => {
  await directory(page);
  await expect(page.getByRole('main').getByText('Alpha Supplies', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Merchants', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(requests.every(url => !url.searchParams.has('companyId'))).toBe(true);
  await expect(page.getByRole('button', { name: /add merchant/i })).toHaveCount(0);
});
test('supports backend search, URL pagination, and detail lookup', async ({ page }) => {
  await directory(page);
  await page.getByRole('link', { name: 'Next page', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole('main').getByText('Second Page Merchant', { exact: true }).first()).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search merchant accounts' }).fill('Alpha');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/search=Alpha/);
  await expect(page.getByRole('main').getByText('Alpha Supplies', { exact: true }).first()).toBeVisible();
  const view = page.getByRole('button', { name: 'View Alpha Supplies', exact: true });
  await view.first().click();
  const dialog = page.getByRole('dialog', { name: 'Merchant account details' });
  await expect(dialog.getByText('alpha@example.invalid', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close details' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(view.first()).toBeFocused();
  expect(requests.some(url => url.pathname === `/merchants/${merchant.id}`)).toBe(true);
  await page.getByRole('searchbox', { name: 'Search merchant accounts' }).fill('missing');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('No merchant accounts match your search.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Clear search', exact: true }).click();
  await expect(page.getByRole('main').getByText('Alpha Supplies', { exact: true }).first()).toBeVisible();
});
test('shows loading, empty, and safe retry states', async ({ page }) => {
  delay = 700; empty = true;
  await directory(page);
  await expect(page.getByRole('status').filter({ hasText: 'Loading merchant accounts' })).toBeVisible();
  await expect(page.getByText('No merchant accounts yet.', { exact: true })).toBeVisible();
  status = 503;
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('couldn’t load merchant accounts');
  await expect(page.locator('body')).not.toContainText('private upstream detail');
  status = 200; empty = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('main').getByText('Alpha Supplies', { exact: true }).first()).toBeVisible();
});
for (const role of ['PLATFORM_ADMIN', 'MERCHANT', 'ACCOUNTANT'] as const) {
  test(`denies ${role} directory entry and hides operational navigation`, async ({ page }) => {
    user = { ...admin, role, ...(role === 'PLATFORM_ADMIN' ? { orgId: null, company: null } : {}) };
    await page.goto('/app/merchants');
    await expect(page.getByRole('heading', { name: 'Company administrator access required' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Merchants', exact: true })).toHaveCount(0);
    expect(requests).toHaveLength(0);
  });
}
test('redirects missing credentials and removes stale tenant data after identity change', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/app/merchants'); await expect(page).toHaveURL(/\/login$/);
  await context.addCookies([{ name: 'fleetora_access', value: 'fixture-merchant-access', url: 'http://localhost:3100', httpOnly: true }]);
  await directory(page);
  await expect(page.getByRole('main').getByText('Alpha Supplies', { exact: true }).first()).toBeVisible();
  user = { ...admin, role: 'PLATFORM_ADMIN', orgId: null, company: null };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading', { name: 'Company administrator access required' })).toBeVisible();
  await expect(page.getByText('Alpha Supplies')).toHaveCount(0);
});
test('handles API authentication rejection without retaining merchant data', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  status = 401;
  await page.goto('/app/merchants');
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).filter(cookie => ['fleetora_access', 'fleetora_refresh'].includes(cookie.name))).toHaveLength(0);
  await expect(page.getByText('Alpha Supplies')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('keeps mobile layout, navigation, and long account names usable', async ({ page }) => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await directory(page);
    await expect(page.getByRole('main').getByText('Alpha Supplies', { exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath('merchants-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: test.info().outputPath('merchants-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'View Alpha Supplies', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Merchant account details' });
  await expect(details.getByText('alpha@example.invalid', { exact: true })).toBeVisible();
  expect(await details.evaluate(element => element.getBoundingClientRect().width <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Mobile navigation' });
  await expect(dialog.getByRole('link', { name: 'Merchants', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await trigger.click(); await dialog.getByRole('link', { name: 'Account & security' }).click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
});
