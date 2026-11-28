import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';

const companyId = '10000000-0000-4000-8000-000000000001';
const merchantId = '10000000-0000-4000-8000-000000000003';
const invitationId = '10000000-0000-4000-8000-000000000004';
const token = 'a'.repeat(64);
const timestamp = '2026-12-01T12:00:00Z';
let backend: Server;
let role: string;
let issued: boolean;
let revoked: boolean;
let readsFail: boolean;
let delivery: string;
let activationStatus: 'PENDING' | 'ACTIVE';
let merchantActive: boolean;
let writes: { method: string; body: unknown }[];
let activationOrigin: string;

test.beforeAll(async () => {
  backend = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://fixture.invalid').pathname;
    let raw = ''; for await (const chunk of req) raw += chunk;
    res.setHeader('Content-Type', 'application/json');
    let data: unknown;
    if (path === '/auth/session') data = { id: '10000000-0000-4000-8000-000000000002', name: 'Fixture admin', email: null, role, orgId: companyId, company: { id: companyId, name: 'Fixture company', currency: "ILS" } };
    else if (path === '/parcels/config') data = { companyId, capabilities: Object.fromEntries(['view','manageMerchants','manageParcels','manageReturns','viewFinance','collect','remit','createSettlements','approveSettlements','paySettlements'].map(key => [key,true])), transitions: {}, currencies: ['ILS'] };
    else if (path.startsWith(`/operations/merchants/${merchantId}/invitations`)) {
      if (req.method !== 'GET') writes.push({ method: req.method ?? '', body: raw ? JSON.parse(raw) : null });
      if (req.method === 'POST') issued = true;
      if (req.method === 'DELETE') revoked = true;
      if (readsFail && req.method === 'GET') res.statusCode = 503;
      const invitation = { companyId, merchantId, id: invitationId, email: 'owner@example.com', role: 'OWNER', permissions: [], state: revoked ? 'REVOKED' : 'PENDING', expiresAt: timestamp, createdAt: timestamp, acceptedAt: null, revokedAt: revoked ? timestamp : null };
      data = req.method === 'POST' ? { ...invitation, token, activationUrl: `${activationOrigin}/merchant/activate#token=${token}`, delivery } : req.method === 'DELETE' ? { companyId, merchantId, revoked: true } : { companyId, merchantId, items: issued ? [invitation] : [] };
    } else if (path === `/merchants/business/${merchantId}`) data = { companyId, merchant: { id: merchantId, companyId, name: 'Fixture business merchant', contactName: 'Fixture contact', phone: '+970599000000', pickupAddress: 'Fixture pickup address', city: 'Fixture city', active: merchantActive, activationStatus, legacyActivation: activationStatus === 'ACTIVE', currency: 'ILS', deliveryFee: '15.00', returnFee: '5.00', serviceFee: '0.00', feePayer: 'MERCHANT', returnFeePolicy: 'ON_MERCHANT_HANDOFF', revision: 1, createdAt: timestamp, updatedAt: timestamp }, statistics: {}, balances: [] };
    else data = { companyId, items: [], page: 1, pageSize: 25, hasNext: false };
    res.end(JSON.stringify({ success: true, data }));
  });
  await new Promise<void>(resolve => backend.listen(3101,'127.0.0.1',resolve));
});
test.afterAll(async () => { backend.closeAllConnections(); await new Promise<void>(resolve => backend.close(() => resolve())); });
test.beforeEach(async ({ context }) => {
  activationOrigin = 'https://app.fleetora.test';
  role = 'COMPANY_ADMIN'; delivery = 'MANUAL'; issued = false; revoked = false; readsFail = false; writes = [];
  activationStatus = 'ACTIVE'; merchantActive = true;
  await context.addCookies([{ name: 'fleetora_access', value: 'isolated-invitation-fixture', url: 'http://localhost:3100', httpOnly: true }]);
});

test('company owner invitation shows a manual activation secret once and revokes pending access', async ({ page, context }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.goto(`/app/merchants/${merchantId}`);
  const panel = page.getByRole('region', { name: 'Merchant app access' });
  await expect(panel.getByText('No invitations have been issued for this merchant.')).toBeVisible();
  await panel.getByLabel('Owner email', { exact: true }).fill('owner@example.com');
  await panel.getByRole('button', { name: 'Create owner invitation', exact: true }).click();
  await expect(panel.getByLabel('Activation link', { exact: true })).toHaveValue(`https://app.fleetora.test/merchant/activate#token=${token}`);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await panel.getByRole('button', { name: 'Copy link', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`https://app.fleetora.test/merchant/activate#token=${token}`);
  await expect(panel.getByText(/Email not sent\. Copy the link instead/)).toBeVisible();
  await expect(panel.getByLabel('Activation token', { exact: true })).toHaveValue(token);
  await panel.getByRole('button', { name: 'Dismiss invitation secret', exact: true }).click();
  await expect(panel.getByLabel('Activation token', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(panel.getByText('Invitation revoked.', { exact: true })).toBeVisible();
  await expect(panel.getByText('Owner · Revoked', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Revoke', exact: true })).toHaveCount(0);
  expect(writes).toEqual([{ method: 'POST', body: { email: 'owner@example.com', role: 'OWNER' } }, { method: 'DELETE', body: null }]);
  expect(runtimeErrors).toEqual([]);
});

test('development merchant invitations retain HTTP loopback activation links', async ({ page }) => {
  activationOrigin = 'http://localhost:3100';
  await page.goto(`/app/merchants/${merchantId}`);
  const panel = page.getByRole('region', { name: 'Merchant app access' });
  await panel.getByLabel('Owner email', { exact: true }).fill('owner@example.com');
  await panel.getByRole('button', { name: 'Create owner invitation', exact: true }).click();
  await expect(panel.getByLabel('Activation link', { exact: true })).toHaveValue(`${activationOrigin}/merchant/activate#token=${token}`);
});
test('Arabic invitation workflow remains labeled and usable on a narrow screen', async ({ page, context }) => {
  await context.addCookies([{ name: 'fleetora_locale', value: 'ar', url: 'http://localhost:3100' }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/app/merchants/${merchantId}`);
  const panel = page.getByRole('region', { name: 'الوصول إلى تطبيق التاجر' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('البريد الإلكتروني للمالك', { exact: true }).fill('owner@example.com');
  await panel.getByRole('button', { name: 'إنشاء دعوة المالك', exact: true }).click();
  await expect(panel.getByLabel('رابط التفعيل', { exact: true })).toHaveValue(`https://app.fleetora.test/merchant/activate#token=${token}`);
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  const width = await panel.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
});

test('loading failures remain distinct from an empty invitation list and can retry', async ({ page }) => {
  readsFail = true;
  await page.goto(`/app/merchants/${merchantId}`);
  const panel = page.getByRole('region', { name: 'Merchant app access' });
  await expect(panel.getByRole('alert')).toContainText('Invitations could not be loaded');
  await expect(panel.getByText('No invitations have been issued for this merchant.')).toHaveCount(0);
  readsFail = false;
  await panel.getByRole('button', { name: 'Refresh invitations', exact: true }).click();
  await expect(panel.getByText('No invitations have been issued for this merchant.')).toBeVisible();
});

test('accountants do not receive invitation administration controls', async ({ page }) => {
  role = 'ACCOUNTANT';
  await page.goto(`/app/merchants/${merchantId}`);
  await expect(page.getByRole('heading', { name: 'Fixture business merchant', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Merchant app access' })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('emailed owner invitation says so and keeps the link and token fallback', async ({ page }) => {
  delivery = 'EMAIL';
  await page.goto(`/app/merchants/${merchantId}`);
  const panel = page.getByRole('region', { name: 'Merchant app access' });
  await panel.getByLabel('Owner email', { exact: true }).fill('owner@example.com');
  await panel.getByRole('button', { name: 'Create owner invitation', exact: true }).click();
  await expect(panel.getByText(/^Invitation emailed\./)).toBeVisible();
  await expect(panel.getByLabel('Activation token', { exact: true })).toHaveValue(token);
});

for (const locale of ['en', 'ar'] as const) {
  test(`activation UX: pending has one status and a single Balance heading in ${locale}`, async ({ page, context }) => {
    activationStatus = 'PENDING';
    await context.addCookies([{ name: 'fleetora_locale', value: locale, url: 'http://localhost:3100' }]);
    await page.goto(`/app/merchants/${merchantId}`);
    await expect(page.getByText(locale === 'en' ? 'Pending owner acceptance' : 'بانتظار قبول المالك للدعوة والاتفاقية', { exact: true })).toHaveCount(1);
    await expect(page.getByText(locale === 'en' ? 'Active merchant' : 'تاجر نشط', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: locale === 'en' ? 'Balance' : 'الرصيد', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: locale === 'en' ? 'Balances by currency' : 'الأرصدة حسب العملة', exact: true })).toHaveCount(0);
  });
  test(`activation UX: active and paused labels only after activation in ${locale}`, async ({ page, context }) => {
    await context.addCookies([{ name: 'fleetora_locale', value: locale, url: 'http://localhost:3100' }]);
    await page.goto(`/app/merchants/${merchantId}`);
    await expect(page.getByText(locale === 'en' ? 'Active merchant' : 'تاجر نشط', { exact: true })).toHaveCount(1);
    merchantActive = false;
    await page.reload();
    await expect(page.getByText(locale === 'en' ? 'Paused merchant' : 'تاجر موقوف مؤقتاً', { exact: true })).toHaveCount(1);
    await expect(page.getByText(locale === 'en' ? 'Active merchant' : 'تاجر نشط', { exact: true })).toHaveCount(0);
  });
  test(`public merchant activation never auto-opens the app and keeps the code hidden until requested in ${locale}`, async ({ page, context }) => {
    await context.clearCookies();
    await context.addCookies([{ name: 'fleetora_locale', value: locale, url: 'http://localhost:3100' }]);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 390, height: 844 });
    const httpRequests: string[] = [];
    page.on('request', request => { if (request.url().startsWith('http')) httpRequests.push(request.url()); });
    const response = await page.goto(`/merchant/activate#token=${token}`);
    expect(await response?.text()).not.toContain(token);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    await expect(page.getByRole('heading', { name: locale === 'en' ? 'Activate Fleetora Merchant' : 'تفعيل تطبيق Fleetora Merchant', exact: true })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.getByLabel(locale === 'en' ? 'Activation code' : 'رمز التفعيل', { exact: true })).toBeHidden();
    expect(await page.locator('body').innerText()).not.toContain(token);
    await expect(page.getByRole('link', { name: locale === 'en' ? 'Open Merchant app' : 'فتح تطبيق التاجر', exact: true })).toHaveAttribute('href', `fleetora-merchant://app/activate?token=${token}`);
    await page.getByRole('button', { name: locale === 'en' ? 'Copy activation code' : 'نسخ رمز التفعيل', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(token);
    await expect(page.getByRole('status')).toHaveText(locale === 'en' ? 'Code copied.' : 'تم نسخ الرمز.');
    await expect(page.getByText(locale === 'en' ? /Install the Fleetora Merchant app/ : /ثبّت تطبيق Fleetora Merchant/)).toBeVisible();
    const reveal = page.getByRole('button', { name: locale === 'en' ? 'Show code' : 'إظهار الرمز', exact: true });
    await expect(reveal).toHaveAttribute('aria-expanded', 'false');
    await reveal.click();
    await expect(page.getByLabel(locale === 'en' ? 'Activation code' : 'رمز التفعيل', { exact: true })).toHaveValue(token);
    expect(httpRequests.every(url => !url.includes(token))).toBe(true);
    expect(httpRequests.some(url => url.includes('/api/'))).toBe(false);
    expect(writes).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  });
}

test('public merchant activation rejects malformed and duplicate fragment tokens', async ({ page }) => {
  for (const fragment of ['token=short', `token=${token}&token=${token}`, `token=${token}&companyId=foreign`]) {
    await page.goto(`/merchant/activate#${fragment}`);
    await expect(page.getByRole('region', { name: 'Activate Fleetora Merchant', exact: true }).getByRole('alert')).toContainText('Ask your company for a new invitation link.');
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open Merchant app', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Back to sign in', exact: true })).toHaveAttribute('href', '/login');
  }
  expect(writes).toEqual([]);
});
