import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessTokenStrategy } from '../auth/strategies/access-token.strategy.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor.js';
import { HttpExceptionFilter } from '../../common/exceptions-filter/http-exception.filter.js';
import { MerchantsController } from './merchants.controller.js';
import { MerchantsService } from './merchants.service.js';
import { MerchantsRepository } from './merchants.repository.js';
import type { ListMerchantsDto } from './dto/list-merchants.dto.js';
import type { UserRole } from '../auth/token/token.payload.js';

const companyA = '11111111-1111-4111-8111-111111111111';
const companyB = '22222222-2222-4222-8222-222222222222';
const firstId = '33333333-3333-4333-8333-333333333333';
const otherId = '44444444-4444-4444-8444-444444444444';
const rows = [
  { id: firstId, companyId: companyA, role: 'MERCHANT', fullName: 'Alpha Supplies', email: 'alpha@example.invalid', isActive: true, isEmailVerified: true, password: 'fixture-private', refreshToken: 'fixture-private', verificationToken: 'fixture-private' },
  { id: '55555555-5555-4555-8555-555555555555', companyId: companyA, role: 'MERCHANT', fullName: 'Zulu Shop', email: null, isActive: false, isEmailVerified: false },
  { id: otherId, companyId: companyB, role: 'MERCHANT', fullName: 'Other Company Shop', email: null, isActive: true, isEmailVerified: true },
  { id: '66666666-6666-4666-8666-666666666666', companyId: companyA, role: 'ACCOUNTANT', fullName: 'Accountant', email: null, isActive: true, isEmailVerified: true },
];

// Real Nest HTTP pipeline, JWT signature validation, persisted-identity strategy,
// DTOs and service. Persistence is an explicit in-memory fixture; no AppModule/DB.
describe('Company Admin merchant-account API (isolated fixtures)', () => {
  let app: INestApplication<App>;
  let actor: { id: string; email: string; role: UserRole; companyId: string | null; isActive: boolean; isEmailVerified: boolean };
  const findUserById = vi.fn();
  const isCompanyActiveForUser = vi.fn();
  const findPage = vi.fn();
  const findOne = vi.fn();
  const secret = 'isolated-merchant-api-test-secret';
  const jwt = new JwtService({ secret });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MerchantsController],
      providers: [
        MerchantsService, AccessTokenStrategy,
        { provide: ConfigService, useValue: new ConfigService({ ACCESS_TOKEN_SECRET: secret }) },
        { provide: AuthRepository, useValue: { findUserById, isCompanyActiveForUser } },
        { provide: MerchantsRepository, useValue: { findPage, findOne } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    actor = { id: '77777777-7777-4777-8777-777777777777', email: 'admin@example.invalid', role: 'COMPANY_ADMIN', companyId: companyA, isActive: true, isEmailVerified: true };
    findUserById.mockImplementation(async (id: string) => id === actor.id ? actor : null);
    isCompanyActiveForUser.mockResolvedValue(true);
    findPage.mockImplementation(async (companyId: string, query: ListMerchantsDto) => rows
      .filter(row => row.companyId === companyId && row.role === 'MERCHANT')
      .filter(row => !query.search || `${row.fullName} ${row.email ?? ''}`.toLowerCase().includes(query.search.toLowerCase()))
      .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id))
      .slice((query.page - 1) * query.pageSize, query.page * query.pageSize + 1));
    findOne.mockImplementation(async (companyId: string, id: string) => rows.find(row => row.companyId === companyId && row.role === 'MERCHANT' && row.id === id) ?? null);
  });
  afterAll(async () => { await app?.close(); });

  function token(claims: Record<string, unknown> = {}) {
    return jwt.sign({ sub: actor.id, email: actor.email, role: actor.role, orgId: actor.companyId ?? '', ...claims }, { expiresIn: '5m' });
  }
  function get(path = '/merchants', bearer = token()) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${bearer}`);
  }

  it('lists only own merchant accounts and strips private fields', async () => {
    const response = await get().expect(200);
    expect(response.body.data).toEqual({ companyId: companyA, items: [
      { id: firstId, name: 'Alpha Supplies', email: 'alpha@example.invalid', isActive: true, isEmailVerified: true },
      { id: rows[1].id, name: 'Zulu Shop', email: null, isActive: false, isEmailVerified: false },
    ], page: 1, pageSize: 20, hasNext: false });
    expect(JSON.stringify(response.body)).not.toMatch(/password|refreshToken|verificationToken|fixture-private|Other Company Shop|Accountant/);
    expect(findPage).toHaveBeenCalledWith(companyA, expect.objectContaining({ page: 1, pageSize: 20 }));
  });
  it('uses current persisted role/company instead of stale JWT claims and submitted scope', async () => {
    const response = await get(`/merchants?companyId=${companyB}&role=PLATFORM_ADMIN`, token({ role: 'PLATFORM_ADMIN', orgId: companyB }))
      .set('X-Company-Id', companyB).expect(200);
    expect(response.body.data.items.map((item: { id: string }) => item.id)).not.toContain(otherId);
    expect(findPage).toHaveBeenCalledWith(companyA, expect.anything());
  });
  it('searches and pages with a bounded lookahead without fabricated totals', async () => {
    const first = await get('/merchants?pageSize=1').expect(200);
    expect(first.body.data).toMatchObject({ page: 1, pageSize: 1, hasNext: true });
    expect(first.body.data.items).toHaveLength(1);
    const second = await get('/merchants?page=2&pageSize=1').expect(200);
    expect(second.body.data.items[0].name).toBe('Zulu Shop');
    expect(second.body.data.hasNext).toBe(false);
    const searched = await get('/merchants?search=%20ALPHA%20').expect(200);
    expect(searched.body.data.items.map((item: { name: string }) => item.name)).toEqual(['Alpha Supplies']);
    expect(searched.body.data).not.toHaveProperty('total');
  });
  it('returns own details and identical 404s for missing, other-company, or non-merchant IDs', async () => {
    const own = await get(`/merchants/${firstId}`).expect(200);
    expect(own.body.data).toEqual({ companyId: companyA, account: { id: firstId, name: 'Alpha Supplies', email: 'alpha@example.invalid', isActive: true, isEmailVerified: true } });
    for (const id of [otherId, rows[3].id, '88888888-8888-4888-8888-888888888888']) {
      const denied = await get(`/merchants/${id}`).expect(404);
      expect(denied.body.message).toBe('Merchant account not found');
    }
  });
  for (const role of ['PLATFORM_ADMIN', 'MERCHANT', 'ACCOUNTANT'] as const) {
    it(`denies ${role} even when JWT claims Company Admin`, async () => {
      actor.role = role;
      if (role === 'PLATFORM_ADMIN') actor.companyId = null;
      for (const path of ['/merchants', `/merchants/${firstId}`]) await get(path, token({ role: 'COMPANY_ADMIN', orgId: companyA })).expect(403);
      expect(findPage).not.toHaveBeenCalled(); expect(findOne).not.toHaveBeenCalled();
    });
  }
  it('denies missing, invalid, expired, or revoked identity before persistence', async () => {
    for (const path of ['/merchants', `/merchants/${firstId}`]) await request(app.getHttpServer()).get(path).expect(401);
    await get('/merchants', 'invalid-token').expect(401);
    await get('/merchants', jwt.sign({ sub: actor.id }, { expiresIn: -1 })).expect(401);
    actor.isActive = false;
    await get().expect(401);
    actor.isActive = true; actor.isEmailVerified = false;
    await get().expect(401);
    actor.isEmailVerified = true; isCompanyActiveForUser.mockResolvedValue(false);
    await get().expect(401);
    expect(findPage).not.toHaveBeenCalled();
  });
  it('never fills a missing authenticated company from submitted scope', async () => {
    actor.companyId = null;
    await get(`/merchants?companyId=${companyA}`).expect(403);
    expect(findPage).not.toHaveBeenCalled();
  });
  for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=10001', 'pageSize=0', 'pageSize=51', 'page=abc', 'page=1&page=2', `search=${'x'.repeat(101)}`]) {
    it(`rejects invalid pagination/search: ${query.slice(0, 35)}`, async () => {
      await get(`/merchants?${query}`).expect(400);
      expect(findPage).not.toHaveBeenCalled();
    });
  }
  it('rejects malformed IDs and exposes no create operation', async () => {
    await get('/merchants/not-an-id').expect(400);
    expect(findOne).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post('/merchants').set('Authorization', `Bearer ${token()}`).send({ name: 'Unsafe account', companyId: companyB }).expect(404);
  });
});
