import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import postgres from '@prisma/orm-postgres/runtime';
import type { RuntimeQueryable } from '@prisma/orm-postgres/orm-client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contract } from '../../prisma/generated/contract.d';
import contractJson from '../../prisma/generated/contract.json' with { type: 'json' };
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor.js';
import { AccessTokenStrategy } from '../auth/strategies/access-token.strategy.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OverviewController } from './overview.controller.js';
import { OverviewRepository } from './overview.repository.js';

describe('Overview HTTP authentication with isolated persistence', () => {
  let app: INestApplication<App>;
  let role = 'COMPANY_ADMIN';
  let companyId = 'company-a';
  let active = true;
  let verified = true;
  let companyActive = true;
  const jwt = new JwtService({ secret: 'isolated-overview-test-secret' });
  const base = postgres<Contract>({ contractJson });
  const query = vi.fn(async (_plan: Parameters<RuntimeQueryable['execute']>[0]) => []);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [OverviewController],
      providers: [OverviewRepository, AccessTokenStrategy,
        { provide: PrismaService, useValue: { db: { raw: base.raw, runtime: () => ({ query }) } } },
        { provide: ConfigService, useValue: new ConfigService({ ACCESS_TOKEN_SECRET: 'isolated-overview-test-secret' }) },
        { provide: AuthRepository, useValue: {
          findUserById: async () => ({ id: 'admin', email: 'admin@example.invalid', role,
            companyId, isActive: active, isEmailVerified: verified }),
          isCompanyActiveForUser: async () => companyActive,
        } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });
  beforeEach(() => {
    role = 'COMPANY_ADMIN'; companyId = 'company-a';
    active = true; verified = true; companyActive = true;
    query.mockClear();
  });
  afterAll(async () => { await app?.close(); });
  function get(path = '/dashboard/overview') {
    return request(app.getHttpServer()).get(path).auth(jwt.sign({
      sub: 'admin', role: 'COMPANY_ADMIN', orgId: 'forged-company',
    }, { expiresIn: '5m' }), { type: 'bearer' });
  }
  it('uses persisted company context and prevents private dashboard caching', async () => {
    const response = await get('/dashboard/overview?companyId=company-b&orgId=company-b')
      .set('X-Fleetora-Company-Context', 'company-b').expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.data.companyId).toBe('company-a');
    expect(query).toHaveBeenCalledTimes(4);
    for (const [plan] of query.mock.calls) {
      const values = plan.ast.collectParamRefs().flatMap((p) => p.kind === 'param-ref' ? [p.value] : []);
      expect(values).toContain('company-a');
      expect(values).not.toContain('company-b');
      expect(values).not.toContain('forged-company');
    }
  });
  it('requires a valid bearer token before any aggregate read', async () => {
    await request(app.getHttpServer()).get('/dashboard/overview').expect(401);
    await request(app.getHttpServer()).get('/dashboard/overview').auth('invalid', { type: 'bearer' }).expect(401);
    expect(query).not.toHaveBeenCalled();
  });
  it.each(['MERCHANT', 'PLATFORM_ADMIN'])('rejects persisted %s despite admin claims in the token', async (denied) => {
    role = denied;
    await get().expect(403);
    expect(query).not.toHaveBeenCalled();
  });
  it('keeps existing accountant read permission', async () => {
    role = 'ACCOUNTANT';
    await get().expect(200);
    expect(query).toHaveBeenCalledTimes(4);
  });
  it('rejects an absent company rather than querying all companies', async () => {
    companyId = '';
    await get().expect(403);
    expect(query).not.toHaveBeenCalled();
  });
  it.each(['inactive', 'unverified', 'suspended'])('rejects %s identity or company state', async (state) => {
    if (state === 'inactive') active = false;
    if (state === 'unverified') verified = false;
    if (state === 'suspended') companyActive = false;
    await get().expect(401);
    expect(query).not.toHaveBeenCalled();
  });
});
