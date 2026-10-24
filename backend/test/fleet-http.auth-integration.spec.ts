import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { AccessTokenStrategy } from '../src/modules/auth/strategies/access-token.strategy.js';
import { AccessTokenGuard } from '../src/modules/auth/guards/access-token.guard.js';
import {
  FleetController,
  HeadquartersController,
} from '../src/modules/fleet/fleet.controller.js';
import { FleetRepository } from '../src/modules/fleet/fleet.repository.js';
import { FleetTicketsService } from '../src/modules/fleet/fleet-tickets.service.js';
import { FleetEvents } from '../src/modules/fleet/fleet-events.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';

const companyId = '91111111-1111-4111-8111-111111111111';
const foreignId = '92222222-2222-4222-8222-222222222222';
const userId = '93333333-3333-4333-8333-333333333333';
describe('fleet REST with actual JWT strategy and disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  let prisma: PrismaService;
  let app: INestApplication;
  let bearer: string;
  async function cleanup() {
    guard.assertVerified();
    for (const id of [companyId, foreignId]) {
      await prisma.CompanyHeadquarters.where({ companyId: id }).delete();
      await prisma.User.where({ companyId: id }).delete();
      await prisma.Company.where({ id }).delete();
    }
    await prisma.User.where({ id: userId }).delete();
  }
  beforeAll(async () => {
    prisma = new PrismaService();
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    const secret = randomBytes(48).toString('hex');
    const config = new ConfigService({ ACCESS_TOKEN_SECRET: secret });
    const auth = new AuthRepository(prisma);
    const module = await Test.createTestingModule({
      controllers: [FleetController, HeadquartersController],
      providers: [
        FleetEvents,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthRepository, useValue: auth },
        {
          provide: FleetRepository,
          useFactory: () => new FleetRepository(prisma),
        },
        {
          provide: FleetTicketsService,
          useFactory: () => new FleetTicketsService(auth),
        },
        {
          provide: AccessTokenStrategy,
          useFactory: () => new AccessTokenStrategy(config, auth),
        },
        {
          provide: AccessTokenGuard,
          useFactory: (reflector: Reflector) => new AccessTokenGuard(reflector),
          inject: [Reflector],
        },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.listen(0, '127.0.0.1');
    // Intentionally stale/forged claims: the REAL strategy must use persisted role/company.
    bearer =
      'Bearer ' +
      new JwtService({ secret }).sign(
        { sub: userId, role: 'PLATFORM_ADMIN', orgId: foreignId },
        { expiresIn: '5m' },
      );
  }, 30000);
  beforeEach(async () => {
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    await cleanup();
    for (const id of [companyId, foreignId])
      await prisma.Company.create({ id, name: 'Fictional HTTP fleet fixture' });
    await prisma.User.create({
      id: userId,
      companyId,
      role: 'COMPANY_ADMIN',
      fullName: 'Fictional HTTP administrator',
      password: randomBytes(32).toString('hex'),
      isActive: true,
      isEmailVerified: true,
    });
  });
  afterAll(async () => {
    await app?.close();
    await guard.teardown(cleanup, () => prisma.db.close());
  });
  const api = () => request(app.getHttpServer());
  it('requires authentication on every endpoint', async () => {
    await api().get('/fleet/locations').expect(401);
    await api().get('/companies/me/headquarters').expect(401);
    await api()
      .patch('/companies/me/headquarters')
      .send({ latitude: 31, longitude: 35, expectedRevision: 0 })
      .expect(401);
    await api().post('/fleet/socket-ticket').expect(401);
  });
  it('returns private company-scoped envelopes and never trusts JWT company/role claims', async () => {
    const response = await api()
      .get('/fleet/locations')
      .set('Authorization', bearer)
      .expect(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body).toMatchObject({
      success: true,
      data: { companyId, headquarters: null, drivers: [] },
    });
  });
  it('validates, saves and rereads HQ through the actual HTTP pipeline', async () => {
    const write = () =>
      api()
        .patch('/companies/me/headquarters')
        .set('Authorization', bearer)
        .set('x-fleetora-company-context', companyId);
    await write()
      .send({ latitude: 91, longitude: 35, expectedRevision: 0 })
      .expect(400);
    await write()
      .send({ latitude: '31', longitude: 35, expectedRevision: 0 })
      .expect(400);
    const response = await write()
      .send({
        latitude: 31.9,
        longitude: 35.2,
        address: ' Fictional HQ ',
        expectedRevision: 0,
        companyId: foreignId,
      })
      .expect(200);
    expect(response.body.data).toMatchObject({
      companyId,
      headquarters: { latitude: 31.9, address: 'Fictional HQ', revision: 1 },
    });
    expect(
      (
        await api()
          .get('/companies/me/headquarters')
          .set('Authorization', bearer)
          .expect(200)
      ).body.data.headquarters,
    ).toEqual(response.body.data.headquarters);
    await write()
      .send({ latitude: 31, longitude: 35, expectedRevision: 0 })
      .expect(409);
    expect(
      await prisma.CompanyHeadquarters.where({ companyId: foreignId }).first(),
    ).toBeNull();
  });
  it('rejects stale UI company context on HQ writes and ticket issuance', async () => {
    await api()
      .patch('/companies/me/headquarters')
      .set('Authorization', bearer)
      .set('x-fleetora-company-context', foreignId)
      .send({ latitude: 31, longitude: 35, expectedRevision: 0 })
      .expect(403);
    await api()
      .post('/fleet/socket-ticket')
      .set('Authorization', bearer)
      .set('x-fleetora-company-context', foreignId)
      .expect(403);
  });
  it.each(['PLATFORM_ADMIN', 'MERCHANT', 'ACCOUNTANT'] as const)(
    'denies persisted %s role on reads and writes',
    async (role) => {
      await prisma.User.where({ id: userId }).update({
        role,
        companyId: role === 'PLATFORM_ADMIN' ? null : companyId,
      });
      await api()
        .get('/fleet/locations')
        .set('Authorization', bearer)
        .expect(403);
      await api()
        .get('/companies/me/headquarters')
        .set('Authorization', bearer)
        .expect(403);
      await api()
        .patch('/companies/me/headquarters')
        .set('Authorization', bearer)
        .set('x-fleetora-company-context', companyId)
        .send({ latitude: 31, longitude: 35, expectedRevision: 0 })
        .expect(403);
    },
  );
  it('does not register an unsafe driver ingestion route', async () => {
    await api()
      .post('/drivers/me/location')
      .set('Authorization', bearer)
      .send({ latitude: 31, longitude: 35 })
      .expect(404);
  });
});
