import 'temporal-polyfill/full/global';
import {
  Global,
  Module,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Temporal } from 'temporal-polyfill';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { PrismaModule } from '../src/modules/prisma/prisma.module.js';
import { AuthModule } from '../src/modules/auth/auth.module.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { PlatformModule } from '../src/modules/platform/platform.module.js';
import { PlatformService } from '../src/modules/platform/platform.service.js';
import { ParcelsModule } from '../src/modules/parcels/parcels.module.js';
import { MerchantsModule } from '../src/modules/merchants/merchants.module.js';
import { DriversModule } from '../src/modules/drivers/drivers.module.js';
import { VehiclesModule } from '../src/modules/vehicles/vehicles.module.js';
import { WarehousesModule } from '../src/modules/warehouses/warehouses.module.js';
import { StaffModule } from '../src/modules/staff/staff.module.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';

const mail = {
  sendInvitationEmail: vi.fn(
    async (_input: { to: string; url: string }) => undefined,
  ),
};
class PlatformTestMailModule {}
Global()(PlatformTestMailModule);
Module({
  providers: [{ provide: MailService, useValue: mail }],
  exports: [MailService],
})(PlatformTestMailModule);
describe('OD-15 platform identity on disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  const config = new ConfigService({
    ACCESS_TOKEN_SECRET: 'platform-access-test-secret-at-least-32',
    REFRESH_TOKEN_SECRET: 'platform-refresh-test-secret-at-least-32',
    FRONTEND_URL: 'https://example.invalid',
    SALT_ROUNDS: 4,
    NODE_ENV: 'test',
  });
  let app: INestApplication, prisma: PrismaService, service: PlatformService;
  const jwt = new JwtService({
    secret: 'platform-access-test-secret-at-least-32',
  });
  const password = 'PlatformPass1';
  const tokenFromMail = () =>
    new URLSearchParams(
      new URL(mail.sendInvitationEmail.mock.calls.at(-1)![0].url).hash.slice(1),
    ).get('token')!;
  const api = () => request(app.getHttpServer());
  const email = () => `${randomUUID()}@example.invalid`;
  async function activateBootstrap() {
    const address = email();
    await service.bootstrap(address);
    const response = await api()
      .post('/platform/invitations/accept')
      .send({ token: tokenFromMail(), name: 'Platform owner', password })
      .expect(201);
    expect(response.body.data).toMatchObject({ accepted: true });
    return login(address);
  }
  async function login(address: string) {
    const response = await api()
      .post('/auth/signin')
      .send({ email: address, password })
      .expect(200);
    return response.body.data.accessToken as string;
  }
  async function issue(actor: string, role = 'SUPPORT', address = email()) {
    const response = await api()
      .post('/platform/invitations')
      .auth(actor, { type: 'bearer' })
      .send({ email: address, role })
      .expect(201);
    expect(new URL(response.body.data.activationUrl).search).toBe('');
    return {
      id: response.body.data.id as string,
      token: new URLSearchParams(
        new URL(response.body.data.activationUrl).hash.slice(1),
      ).get('token')!,
      email: address,
    };
  }
  async function member(actor: string, role: string) {
    const invite = await issue(actor, role);
    await api()
      .post('/platform/invitations/accept')
      .send({ token: invite.token, name: 'Platform staff', password })
      .expect(201);
    const bearer = await login(invite.email);
    const me = await api()
      .get('/platform/me')
      .auth(bearer, { type: 'bearer' })
      .expect(200);
    return { bearer, id: me.body.data.userId as string };
  }
  async function cleanup() {
    guard.assertVerified();
    await prisma.db.orm.public.PlatformAccessEvent.deleteAll();
    await prisma.db.orm.public.PlatformInvitation.deleteAll();
    await prisma.db.orm.public.PlatformStaff.deleteAll();
    await prisma.db.orm.public.PlatformAdminGrant.deleteAll();
    await prisma.User.where({ role: 'PLATFORM_ADMIN' }).deleteAll();
    await prisma.User.where({
      fullName: 'Platform isolation fixture',
    }).deleteAll();
    await prisma.Company.where({
      name: 'Platform isolation fixture',
    }).deleteAll();
  }
  beforeAll(async () => {
    prisma = new PrismaService();
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PrismaModule,
        PlatformTestMailModule,
        AuthModule,
        PlatformModule,
        ParcelsModule,
        MerchantsModule,
        DriversModule,
        VehiclesModule,
        WarehousesModule,
        StaffModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.listen(0, '127.0.0.1');
    service = module.get(PlatformService);
  });
  beforeEach(async () => {
    await cleanup();
    mail.sendInvitationEmail.mockClear();
  });
  afterAll(async () => {
    await app?.close();
    if (prisma) {
      await cleanup();
      await prisma.db.close();
    }
  });
  it('bootstraps idempotently, emails a fragment token, hashes it, and permanently refuses after first acceptance', async () => {
    const address = email();
    await service.bootstrap(address);
    const firstToken = tokenFromMail();
    await service.bootstrap(address);
    const token = tokenFromMail();
    expect(token).not.toBe(firstToken);
    expect(await prisma.db.orm.public.PlatformInvitation.all()).toHaveLength(1);
    expect(
      (await prisma.db.orm.public.PlatformInvitation.first())?.tokenHash,
    ).not.toBe(token);
    expect(
      await prisma.User.where({ role: 'PLATFORM_ADMIN' }).all(),
    ).toHaveLength(0);
    await expect(service.bootstrap(email())).rejects.toMatchObject({
      status: 409,
    });
    await api()
      .post('/platform/invitations/accept')
      .send({ token: firstToken, name: 'Owner', password })
      .expect(400);
    await api()
      .post('/platform/invitations/accept')
      .send({ token, name: 'Owner', password })
      .expect(201);
    await expect(service.bootstrap(address)).rejects.toMatchObject({
      status: 409,
    });
    await api()
      .post('/platform/invitations/accept')
      .send({ token, name: 'Owner', password })
      .expect(400);
    const bearer = await login(address);
    await api()
      .get('/auth/session')
      .auth(bearer, { type: 'bearer' })
      .expect(200)
      .expect((r) =>
        expect(r.body.data).toMatchObject({
          role: 'PLATFORM_ADMIN',
          orgId: null,
          company: null,
        }),
      );
  });
  it.each(['SUPER_ADMIN', 'COMPANY_MANAGER', 'BILLING', 'SUPPORT'])(
    'enforces persisted %s matrix and denies every company operational entry point',
    async (role) => {
      const owner = await activateBootstrap();
      const staff = await member(owner, role);
      await api()
        .get('/platform/me')
        .auth(staff.bearer, { type: 'bearer' })
        .expect(200)
        .expect((r) => expect(r.body.data.role).toBe(role));
      await api()
        .get('/platform/staff')
        .auth(staff.bearer, { type: 'bearer' })
        .expect(role === 'SUPER_ADMIN' ? 200 : 403);
      await api()
        .get('/platform/audit')
        .auth(staff.bearer, { type: 'bearer' })
        .expect(role === 'SUPER_ADMIN' ? 200 : 403);
      await api()
        .patch(`/platform/staff/${staff.id}`)
        .auth(staff.bearer, { type: 'bearer' })
        .send({ role: 'SUPER_ADMIN', active: true })
        .expect(role === 'SUPER_ADMIN' ? 200 : 403);
      const pending = await issue(owner);
      await api()
        .delete(`/platform/invitations/${pending.id}`)
        .auth(staff.bearer, { type: 'bearer' })
        .expect(role === 'SUPER_ADMIN' ? 200 : 403);
      await api()
        .post('/platform/invitations')
        .auth(staff.bearer, { type: 'bearer' })
        .send({ email: email(), role: 'SUPER_ADMIN' })
        .expect(role === 'SUPER_ADMIN' ? 201 : 403);
      for (const path of [
        '/merchants/business',
        '/merchants',
        '/parcels',
        '/company/staff',
        '/drivers',
        '/vehicles',
        '/warehouses',
      ])
        await api()
          .get(path)
          .auth(staff.bearer, { type: 'bearer' })
          .set('X-Fleetora-Company-Context', randomUUID())
          .expect(403);
    },
  );
  it('rejects company identities and unprovisioned legacy platform admins despite forged platform claims', async () => {
    const company = await prisma.Company.create({
      name: 'Platform isolation fixture',
    });
    const user = await prisma.User.create({
      companyId: company.id,
      email: email(),
      role: 'COMPANY_ADMIN',
      fullName: 'Platform isolation fixture',
      password: 'unused',
      isEmailVerified: true,
    });
    const forged = jwt.sign({
      sub: user.id,
      role: 'PLATFORM_ADMIN',
      orgId: '',
      typ: 'access',
    });
    await api()
      .get('/platform/me')
      .auth(forged, { type: 'bearer' })
      .expect(403);
    await expect(service.bootstrap(user.email!)).rejects.toMatchObject({
      status: 409,
    });
    const legacy = await prisma.User.create({
      role: 'PLATFORM_ADMIN',
      companyId: null,
      fullName: 'Legacy platform',
      password: 'unused',
      isEmailVerified: true,
    });
    await api()
      .get('/platform/me')
      .auth(
        jwt.sign({
          sub: legacy.id,
          role: 'PLATFORM_ADMIN',
          orgId: '',
          typ: 'access',
        }),
        { type: 'bearer' },
      )
      .expect(403);
  });
  it('protects the last Super Admin and rejects cross-company targets without altering them', async () => {
    const owner = await activateBootstrap();
    const me = (await api().get('/platform/me').auth(owner, { type: 'bearer' }))
      .body.data;
    await api()
      .patch(`/platform/staff/${me.userId}`)
      .auth(owner, { type: 'bearer' })
      .send({ role: 'SUPPORT' })
      .expect(409);
    await api()
      .patch(`/platform/staff/${me.userId}`)
      .auth(owner, { type: 'bearer' })
      .send({ active: false })
      .expect(409);
    const company = await prisma.Company.create({
      name: 'Platform isolation fixture',
    });
    const user = await prisma.User.create({
      companyId: company.id,
      role: 'COMPANY_ADMIN',
      fullName: 'Platform isolation fixture',
      password: 'unused',
    });
    await api()
      .patch(`/platform/staff/${user.id}`)
      .auth(owner, { type: 'bearer' })
      .send({ role: 'SUPER_ADMIN' })
      .expect(404);
    expect((await prisma.User.where({ id: user.id }).first())?.role).toBe(
      'COMPANY_ADMIN',
    );
  });
  it('serializes concurrent last-admin demotions and revokes access and refresh on deactivation', async () => {
    const owner = await activateBootstrap();
    const second = await member(owner, 'SUPER_ADMIN');
    const ownerId = (
      await api().get('/platform/me').auth(owner, { type: 'bearer' })
    ).body.data.userId;
    const results = await Promise.all([
      api()
        .patch(`/platform/staff/${ownerId}`)
        .auth(owner, { type: 'bearer' })
        .send({ role: 'SUPPORT' }),
      api()
        .patch(`/platform/staff/${second.id}`)
        .auth(second.bearer, { type: 'bearer' })
        .send({ role: 'SUPPORT' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const survivor =
      results[0].status === 200 ? second : { bearer: owner, id: ownerId };
    const support = await member(survivor.bearer, 'SUPPORT');
    await api()
      .patch(`/platform/staff/${support.id}`)
      .auth(survivor.bearer, { type: 'bearer' })
      .send({ active: false })
      .expect(200);
    await api()
      .get('/platform/me')
      .auth(support.bearer, { type: 'bearer' })
      .expect(401);
    await api()
      .get('/auth/session')
      .auth(support.bearer, { type: 'bearer' })
      .expect(401);
    expect(
      (await prisma.User.where({ id: support.id }).first())?.refreshToken,
    ).toBeNull();
    await api()
      .patch(`/platform/staff/${support.id}`)
      .auth(survivor.bearer, { type: 'bearer' })
      .send({ active: true })
      .expect(200);
    await api()
      .get('/platform/me')
      .auth(support.bearer, { type: 'bearer' })
      .expect(401);
  });
  it('rejects expired, revoked, weak-password and concurrent invitation acceptance', async () => {
    const owner = await activateBootstrap();
    const old = await issue(owner);
    await prisma.db.orm.public.PlatformInvitation.where({ id: old.id }).update({
      expiresAt: Temporal.Now.instant().subtract({ hours: 1 }),
    });
    await api()
      .post('/platform/invitations/accept')
      .send({ token: old.token, name: 'Staff', password })
      .expect(400);
    const revoked = await issue(owner);
    await api()
      .delete(`/platform/invitations/${revoked.id}`)
      .auth(owner, { type: 'bearer' })
      .expect(200);
    await api()
      .post('/platform/invitations/accept')
      .send({ token: revoked.token, name: 'Staff', password })
      .expect(400);
    const invite = await issue(owner);
    await api()
      .post('/platform/invitations/accept')
      .send({ token: invite.token, name: 'Staff', password: 'weak' })
      .expect(400);
    const results = await Promise.all(
      [1, 2].map(() =>
        api()
          .post('/platform/invitations/accept')
          .send({ token: invite.token, name: 'Staff', password }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    const audit = await api()
      .get('/platform/audit')
      .auth(owner, { type: 'bearer' })
      .expect(200);
    expect(JSON.stringify(audit.body)).not.toContain(invite.token);
    expect(JSON.stringify(audit.body)).not.toContain('tokenHash');
  });
  it('permits one concurrent bootstrap intent and safely retries an email delivery failure', async () => {
    mail.sendInvitationEmail.mockRejectedValueOnce(
      new Error('private mail failure'),
    );
    const address = email();
    await expect(service.bootstrap(address)).rejects.toMatchObject({
      status: 503,
    });
    await service.bootstrap(address);
    expect(await prisma.db.orm.public.PlatformInvitation.all()).toHaveLength(1);
    const results = await Promise.allSettled([
      service.bootstrap(address),
      service.bootstrap(email()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.db.orm.public.PlatformInvitation.all()).toHaveLength(1);
    expect(
      await prisma.User.where({ role: 'PLATFORM_ADMIN' }).all(),
    ).toHaveLength(0);
  });
  it('rechecks persisted platform authority inside writes and does not count a revoked Super Admin grant', async () => {
    const owner = await activateBootstrap();
    const ownerId = (
      await api().get('/platform/me').auth(owner, { type: 'bearer' })
    ).body.data.userId;
    const second = await member(owner, 'SUPER_ADMIN');
    await prisma.db.orm.public.PlatformAdminGrant.where({
      userId: second.id,
    }).update({
      status: 'REVOKED',
      revokedAt: Temporal.Now.instant(),
      revokedById: ownerId,
    });
    await api()
      .patch(`/platform/staff/${ownerId}`)
      .auth(owner, { type: 'bearer' })
      .send({ role: 'SUPPORT' })
      .expect(409);
    await prisma.db.orm.public.PlatformStaff.where({ userId: ownerId }).update({
      role: 'SUPPORT',
    });
    await expect(
      service.update(
        { sub: ownerId, role: 'PLATFORM_ADMIN', orgId: '', email: '' },
        second.id,
        { role: 'SUPER_ADMIN' },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('throttles activation using the existing recovery/client-source boundary', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++)
      statuses.push(
        (
          await api()
            .post('/platform/invitations/accept')
            .send({ token: 'b'.repeat(64), name: 'Owner', password })
        ).status,
      );
    expect(statuses).toContain(429);
    expect(statuses.every((status) => status === 400 || status === 429)).toBe(
      true,
    );
  });
});
