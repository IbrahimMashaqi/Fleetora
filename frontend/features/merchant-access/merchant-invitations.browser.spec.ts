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
let writes: { method: string; body: unknown }[];

test.beforeAll(async () => {
  backend = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://fixture.invalid').pathname;
    let raw = ''; for await (const chunk of req) raw += chunk;
    res.setHeader('Content-Type', 'application/json');
    let data: unknown;
    if (path === '/auth/session') data = { id: '10000000-0000-4000-8000-000000000002', name: 'Fixture admin', email: null, role, orgId: companyId, company: { id: companyId, name: 'Fixture company' } };
    else if (path === '/parcels/config') data = { companyId, capabilities: Object.fromEntries(['view','manageMerchants','manageParcels','manageReturns','viewFinance','collect','remit','createSettlements','approveSettlements','paySettlements'].map(key => [key,true])), transitions: {}, currencies: ['ILS'] };
    else if (path.startsWith(`/operations/merchants/${merchantId}/invitations`)) {
      if (req.method !== 'GET') writes.push({ method: req.method ?? '', body: raw ? JSON.parse(raw) : null });
      if (req.method === 'POST') issued = true;
      if (req.method === 'DELETE') revoked = true;
      if (readsFail && req.method === 'GET') res.statusCode = 503;
      const invitation = { companyId, merchantId, id: invitationId, email: 'owner@example.com', role: 'OWNER', permissions: [], state: revoked ? 'REVOKED' : 'PENDING', expiresAt: timestamp, createdAt: timestamp, acceptedAt: null, revokedAt: revoked ? timestamp : null };
      data = req.method === 'POST' ? { ...invitation, token, delivery: 'MANUAL' } : req.method === 'DELETE' ? { companyId, merchantId, revoked: true } : { companyId, merchantId, items: issued ? [invitation] : [] };
    } else if (path === `/merchants/business/${merchantId}`) data = { companyId, merchant: { id: merchantId, companyId, name: 'Fixture business merchant', contactName: 'Fixture contact', phone: '+970599000000', pickupAddress: 'Fixture pickup address', city: 'Fixture city', active: true, currency: 'ILS', deliveryFee: '15.00', returnFee: '5.00', serviceFee: '0.00', feePayer: 'MERCHANT', returnFeePolicy: 'ON_MERCHANT_HANDOFF', revision: 1, createdAt: timestamp, updatedAt: timestamp }, statistics: {}, balances: [] };
    else data = { companyId, items: [], page: 1, pageSize: 25, hasNext: false };
    res.end(JSON.stringify({ success: true, data }));
  });
  await new Promise<void>(resolve => backend.listen(3101,'127.0.0.1',resolve));
});
test.afterAll(async () => { backend.closeAllConnections(); await new Promise<void>(resolve => backend.close(() => resolve())); });
test.beforeEach(async ({ context }) => {
  role = 'COMPANY_ADMIN'; issued = false; revoked = false; readsFail = false; writes = [];
  await context.addCookies([{ name: 'fleetora_access', value: 'isolated-invitation-fixture', url: 'http://localhost:3100', httpOnly: true }]);
});

test('company owner invitation shows a manual activation secret once and revokes pending access', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.goto(`/app/merchants/${merchantId}`);
  const panel = page.getByRole('region', { name: 'Merchant app access' });
  await expect(panel.getByText('No invitations have been issued for this merchant.')).toBeVisible();
  await panel.getByLabel('Owner email', { exact: true }).fill('owner@example.com');
  await panel.getByRole('button', { name: 'Create owner invitation', exact: true }).click();
  await expect(panel.getByLabel('Activation link', { exact: true })).toHaveValue(`fleetora-merchant://app/activate?token=${token}`);
  await expect(panel.getByText(/No email was sent/)).toBeVisible();
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

test('Arabic invitation workflow remains labeled and usable on a narrow screen', async ({ page, context }) => {
  await context.addCookies([{ name: 'fleetora_locale', value: 'ar', url: 'http://localhost:3100' }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/app/merchants/${merchantId}`);
  const panel = page.getByRole('region', { name: 'الوصول إلى تطبيق التاجر' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('البريد الإلكتروني للمالك', { exact: true }).fill('owner@example.com');
  await panel.getByRole('button', { name: 'إنشاء دعوة المالك', exact: true }).click();
  await expect(panel.getByLabel('رابط التفعيل', { exact: true })).toHaveValue(`fleetora-merchant://app/activate?token=${token}`);
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
