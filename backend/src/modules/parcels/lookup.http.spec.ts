import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import postgres from '@prisma/orm-postgres/runtime';
import type { RuntimeQueryable } from '@prisma/orm-postgres/orm-client';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { Contract } from '../../prisma/generated/contract.d';
import contractJson from '../../prisma/generated/contract.json' with { type: 'json' };
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor.js';
import { AccessTokenStrategy } from '../auth/strategies/access-token.strategy.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LookupController } from './lookup.controller.js';
import { LookupRepository } from './lookup.repository.js';

describe('lookup HTTP persisted authority (isolated persistence)', () => {
  let app: INestApplication<App>,
    role = 'COMPANY_ADMIN',
    companyId = 'company-a';
  const jwt = new JwtService({ secret: 'isolated-lookup-test-secret' });
  const base = postgres<Contract>({ contractJson });
  const query = vi.fn(
    async (_plan: Parameters<RuntimeQueryable['execute']>[0]) => [],
  );
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [LookupController],
      providers: [
        LookupRepository,
        AccessTokenStrategy,
        {
          provide: PrismaService,
          useValue: { db: { raw: base.raw, runtime: () => ({ query }) } },
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            ACCESS_TOKEN_SECRET: 'isolated-lookup-test-secret',
          }),
        },
        {
          provide: AuthRepository,
          useValue: {
            findUserById: async () => ({
              id: 'staff',
              email: null,
              role,
              companyId,
              isActive: true,
              isEmailVerified: true,
              authVersion: 1,
            }),
            hasDriverIdentity: async () => true,
            isCompanyActiveForUser: async () => true,
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });
  beforeEach(() => {
    role = 'COMPANY_ADMIN';
    companyId = 'company-a';
    query.mockClear();
  });
  afterAll(async () => {
    await app?.close();
  });
  function get(suffix = 'kind=merchants') {
    return request(app.getHttpServer())
      .get(`/operation-lookups?${suffix}`)
      .auth(
        jwt.sign(
          {
            sub: 'staff',
            role: role === 'DRIVER' ? 'DRIVER' : 'COMPANY_ADMIN',
            orgId: 'forged-company',
            typ: 'access',
            sessionVersion: 1,
          },
          { expiresIn: '5m' },
        ),
        { type: 'bearer' },
      );
  }
  it.each(['COMPANY_ADMIN', 'OPERATIONS', 'ACCOUNTANT', 'WAREHOUSE'])(
    'allows persisted %s and scopes every branch',
    async (allowed) => {
      role = allowed;
      const response = await get('kind=merchants&search=احمد').expect(200);
      expect(response.body.data.companyId).toBe('company-a');
      expect(response.headers['cache-control']).toBe('private, no-store');
      const values = query.mock.calls.flatMap(([plan]) =>
        plan.ast
          .collectParamRefs()
          .flatMap((p) => (p.kind === 'param-ref' ? [p.value] : [])),
      );
      expect(values).toContain('company-a');
      expect(values).not.toContain('forged-company');
    },
  );
  it.each(['MERCHANT', 'DRIVER', 'PLATFORM_ADMIN'])(
    'denies %s before database search',
    async (denied) => {
      role = denied;
      await get().expect(403);
      expect(query).not.toHaveBeenCalled();
    },
  );
  it('rejects anonymous access, forged tenant, oversized search and invalid kind', async () => {
    await request(app.getHttpServer())
      .get('/operation-lookups?kind=merchants')
      .expect(401);
    for (const suffix of [
      'kind=merchants&companyId=company-b',
      'kind=users',
      `kind=drivers&search=${'x'.repeat(101)}`,
    ])
      await get(suffix).expect(400);
    expect(query).not.toHaveBeenCalled();
  });
  it('does not let read-only staff request finance or warehouse capabilities', async () => {
    role = 'OPERATIONS';
    await get('kind=parcels&collectable=true').expect(403);
    role = 'ACCOUNTANT';
    await get('kind=warehouses').expect(403);
    companyId = '';
    await get().expect(403);
    expect(query).not.toHaveBeenCalled();
  });
});
