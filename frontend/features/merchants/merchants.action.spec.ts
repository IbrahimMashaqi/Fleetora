import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';
import { readMerchantsForSession } from './merchants.server';

type Jar = Parameters<typeof readMerchantsForSession>[0];
type Reply = { path: string; status?: number; body?: unknown; disconnect?: boolean };
let server: Server;
let apiUrl: string;
let replies: Reply[];
let paths: string[];
let values: Map<string, string>;
let jar: Jar;
const originalApi = process.env.FLEETORA_API_URL;
const scope = { userId: 'admin', companyId: 'company-a' };
const user = { id: 'admin', name: 'Admin', email: null, role: 'COMPANY_ADMIN', orgId: 'company-a', company: { id: 'company-a', name: 'Company A' } };
const merchant = { id: '33333333-3333-4333-8333-333333333333', name: 'Alpha Supplies', email: null, isActive: true, isEmailVerified: false };
const query = { search: '', page: 1, pageSize: 20 };
const identity = { success: true, data: user };
const page = { items: [merchant], page: 1, pageSize: 20, hasNext: false };

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.invalid');
    paths.push(url.pathname + url.search);
    const reply = replies.shift();
    if (!reply || reply.path !== url.pathname || request.method !== (url.pathname === '/auth/refresh' ? 'POST' : 'GET')) { response.writeHead(500).end(); return; }
    if (reply.disconnect) { request.socket.destroy(); return; }
    response.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' }).end(JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  apiUrl = `http://127.0.0.1:${address.port}`;
});
test.beforeEach(() => {
  process.env.FLEETORA_API_URL = apiUrl;
  paths = []; values = new Map([['fleetora_access', 'fixture-access'], ['fleetora_refresh', 'fixture-refresh']]);
  jar = { get: name => { const value = values.get(name); return value === undefined ? undefined : { value }; }, set: (name, value) => { values.set(name, value); }, delete: name => { values.delete(name); } };
  replies = [{ path: '/auth/session', body: identity }, { path: '/merchants', body: { success: true, data: { companyId: scope.companyId, ...page } } }];
});
test.afterAll(async () => {
  if (originalApi === undefined) delete process.env.FLEETORA_API_URL; else process.env.FLEETORA_API_URL = originalApi;
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
function list() { return readMerchantsForSession(jar, scope, { kind: 'list', query }); }

test('returns only allowlisted account data and never sends client company scope', async () => {
  replies[1].body = { success: true, data: { companyId: scope.companyId, ...page, password: 'private-detail', items: [{ ...merchant, refreshToken: 'private-detail' }] } };
  expect(await list()).toEqual({ status: 'list', data: page });
  const target = new URL(paths[1], 'http://fixture.invalid');
  expect(Object.fromEntries(target.searchParams)).toEqual({ page: '1', pageSize: '20' });
});
for (const role of ['PLATFORM_ADMIN', 'MERCHANT', 'ACCOUNTANT']) {
  test(`denies current ${role} before merchant requests`, async () => {
    replies[0].body = { success: true, data: { ...user, role, ...(role === 'PLATFORM_ADMIN' ? { orgId: null, company: null } : {}) } };
    expect((await list()).status).toBe('forbidden');
    expect(paths).toEqual(['/auth/session']);
  });
}
test('rejects stale submitted company/user context without using it as authority', async () => {
  expect((await readMerchantsForSession(jar, { userId: 'other-user', companyId: 'company-b' }, { kind: 'list', query })).status).toBe('changed');
  expect(paths).toEqual(['/auth/session']);
});
test('uses established rotation and keeps new cookies during a subsequent read outage', async () => {
  replies = [
    { path: '/auth/session', status: 401 },
    { path: '/auth/refresh', body: { success: true, data: { accessToken: 'rotated-access', refreshToken: 'rotated-refresh' } } },
    { path: '/auth/session', body: identity },
    { path: '/merchants', status: 503 },
  ];
  expect((await list()).status).toBe('unavailable');
  expect(values.get('fleetora_refresh')).toBe('rotated-refresh');
  expect(paths).toHaveLength(4);
});
test('denies unauthenticated requests without contacting merchant persistence', async () => {
  values.clear(); expect((await list()).status).toBe('unauthenticated'); expect(paths).toHaveLength(0);
});
for (const [status, expected] of [[400, 'invalid'], [401, 'unauthenticated'], [403, 'forbidden'], [503, 'unavailable']] as const) {
  test(`maps ${status} safely without exposing upstream details`, async () => {
    replies[1] = { path: '/merchants', status, body: { message: 'private-detail fixture-access fixture-refresh' } };
    const result = await list(); expect(result.status).toBe(expected);
    expect(JSON.stringify(result)).not.toMatch(/private-detail|fixture-access|fixture-refresh/);
    if (status === 401) expect(values.size).toBe(0);
    expect(paths).toHaveLength(2);
  });
}
for (const invalidQuery of [{ ...query, page: 0 }, { ...query, pageSize: 51 }, { ...query, search: 'x'.repeat(101) }]) {
  test(`rejects invalid query before transport: ${JSON.stringify(invalidQuery)}`, async () => {
    expect((await readMerchantsForSession(jar, scope, { kind: 'list', query: invalidQuery })).status).toBe('invalid');
    expect(paths).toHaveLength(0);
  });
}
test('rejects malformed and unexpected list responses rather than inventing empty data', async () => {
  replies[1].body = { success: true, data: { companyId: scope.companyId, ...page, page: 2 } };
  expect((await list()).status).toBe('unavailable');
});
test('handles read network failure safely and allows a separately requested retry', async () => {
  replies[1] = { path: '/merchants', disconnect: true };
  expect((await list()).status).toBe('unavailable');
  replies = [{ path: '/auth/session', body: identity }, { path: '/merchants', body: { success: true, data: { companyId: scope.companyId, ...page } } }];
  expect((await list()).status).toBe('list');
});
test('loads allowlisted details and reports an unavailable record without leaking existence', async () => {
  replies[1] = { path: `/merchants/${merchant.id}`, body: { success: true, data: { companyId: scope.companyId, account: { ...merchant, password: 'private-detail' } } } };
  expect(await readMerchantsForSession(jar, scope, { kind: 'detail', id: merchant.id })).toEqual({ status: 'detail', data: merchant });
  replies = [{ path: '/auth/session', body: identity }, { path: `/merchants/${merchant.id}`, status: 404 }];
  expect((await readMerchantsForSession(jar, scope, { kind: 'detail', id: merchant.id })).status).toBe('not-found');
});
test('rejects invalid detail IDs before transport', async () => {
  expect((await readMerchantsForSession(jar, scope, { kind: 'detail', id: '../auth/session' })).status).toBe('invalid');
  expect(paths).toHaveLength(0);
});
for (const kind of ['list', 'detail'] as const) {
  test(`drops ${kind} data when backend company changes after session validation`, async () => {
    replies[1] = { path: kind === 'list' ? '/merchants' : `/merchants/${merchant.id}`, body: { success: true, data: { companyId: 'company-b', ...page, account: merchant } } };
    const result = await readMerchantsForSession(jar, scope, kind === 'list' ? { kind, query } : { kind, id: merchant.id });
    expect(result).toEqual({ status: 'changed' });
    expect(JSON.stringify(result)).not.toContain(merchant.name);
  });
}
