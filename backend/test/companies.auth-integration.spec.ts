import 'temporal-polyfill/full/global';
import { Temporal } from 'temporal-polyfill';
import {
  Global,
  Module,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
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
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { AccessTokenStrategy } from '../src/modules/auth/strategies/access-token.strategy.js';
import { PlatformModule } from '../src/modules/platform/platform.module.js';
import { CompaniesModule } from '../src/modules/companies/companies.module.js';
import { PlatformService } from '../src/modules/platform/platform.service.js';
import { CompaniesRepository } from '../src/modules/companies/companies.repository.js';
import { ParcelsModule } from '../src/modules/parcels/parcels.module.js';
import { ParcelStore } from '../src/modules/parcels/parcel-store.js';
import { MerchantsModule } from '../src/modules/merchants/merchants.module.js';
import { DriversModule } from '../src/modules/drivers/drivers.module.js';
import { FleetModule } from '../src/modules/fleet/fleet.module.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';
const mail = {
  sendInvitationEmail: vi.fn(
    async (_input: { to: string; url: string }) => undefined,
  ),
  sendVerificationEmail: vi.fn(async () => undefined),
};
class CompaniesTestMailModule {}
Global()(CompaniesTestMailModule);
Module({
  providers: [{ provide: MailService, useValue: mail }],
  exports: [MailService],
})(CompaniesTestMailModule);
describe('BR-045/047/068 company lifecycle on disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  const config = new ConfigService({
    FRONTEND_URL: 'https://example.invalid',
    NODE_ENV: 'test',
    SALT_ROUNDS: 4,
    ACCESS_TOKEN_SECRET: 'company-access-test-secret-only',
    REFRESH_TOKEN_SECRET: 'company-refresh-test-secret-only',
  });
  const jwt = new JwtService({ secret: 'company-access-test-secret-only' });
  const password = 'CompanyPass1';
  let prisma: PrismaService,
    app: INestApplication,
    platform: PlatformService,
    owner: string;
  const companies: string[] = [],
    users: string[] = [];
  const email = () => `${randomUUID()}@example.invalid`;
  const api = () => request(app.getHttpServer());
  const tokenOf = (url: string) =>
    new URLSearchParams(new URL(url).hash.slice(1)).get('token')!;
  const call = (
    method: 'get' | 'post' | 'patch',
    path: string,
    token = owner,
  ) => api()[method](path).auth(token, { type: 'bearer' });
  const login = async (address: string) =>
    (
      await api()
        .post('/auth/signin')
        .send({ email: address, password })
        .expect(200)
    ).body.data.accessToken as string;
  async function signup(name = 'Company fixture') {
    const address = email();
    const response = await api()
      .post('/auth/signup')
      .send({ name, email: address, password, currency: 'ILS' })
      .expect(201);
    const user = await prisma.User.where({
      id: response.body.data.userId,
    }).first();
    if (!user?.companyId) throw new Error('Missing signup fixture');
    companies.push(user.companyId);
    users.push(user.id);
    await prisma.User.where({ id: user.id }).update({ isEmailVerified: true });
    return {
      id: user.companyId,
      userId: user.id,
      email: address,
      token: await login(address),
    };
  }
  async function platformStaff(role: string) {
    const address = email();
    const result = await call('post', '/platform/invitations')
      .send({ email: address, role })
      .expect(201);
    await api()
      .post('/platform/invitations/accept')
      .send({
        token: tokenOf(result.body.data.activationUrl),
        name: 'Platform fixture',
        password,
      })
      .expect(201);
    const user = await prisma.User.where({ email: address }).first();
    if (user) users.push(user.id);
    return login(address);
  }
  const transition = (
    id: string,
    action: string,
    revision: number,
    reason?: string,
    actor = owner,
  ) =>
    call('post', `/platform/companies/${id}/transitions`, actor).send({
      action,
      revision,
      ...(reason ? { reason } : {}),
    });
  async function cleanup() {
    guard.assertVerified();
    for (const companyId of companies.splice(0)) {
      await prisma.Company.where({ id: companyId }).update({
        primaryAdminId: null,
      });
      await prisma.db.orm.public.CompanyAdminInvitation.where({
        companyId,
      }).deleteAll();
      await prisma.db.orm.public.CompanyAccessEvent.where({
        companyId,
      }).deleteAll();
      await prisma.db.orm.public.CodCollection.where({ companyId }).deleteAll();
      await prisma.db.orm.public.MerchantSettlement.where({
        companyId,
      }).deleteAll();
      await prisma.Shipment.where({ companyId }).deleteAll();
      await prisma.db.orm.public.Merchant.where({ companyId }).deleteAll();
      await prisma.Worker.where({ companyId }).deleteAll();
      await prisma.User.where({ companyId }).deleteAll();
      await prisma.Company.where({ id: companyId }).delete();
    }
    await prisma.db.orm.public.PlatformAccessEvent.deleteAll();
    await prisma.db.orm.public.PlatformInvitation.deleteAll();
    await prisma.db.orm.public.PlatformStaff.deleteAll();
    await prisma.db.orm.public.PlatformAdminGrant.deleteAll();
    for (const id of users.splice(0))
      await prisma.User.where({ id }).deleteAll();
  }
  beforeAll(async () => {
    prisma = new PrismaService();
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PrismaModule,
        CompaniesTestMailModule,
        AuthModule,
        PlatformModule,
        CompaniesModule,
        ParcelsModule,
        MerchantsModule,
        DriversModule,
        FleetModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.listen(0, '127.0.0.1');
    platform = module.get(PlatformService);
  }, 30000);
  beforeEach(async () => {
    await cleanup();
    mail.sendInvitationEmail.mockClear();
    const address = email();
    await platform.bootstrap(address);
    await api()
      .post('/platform/invitations/accept')
      .send({
        token: tokenOf(mail.sendInvitationEmail.mock.calls.at(-1)![0].url),
        name: 'Owner',
        password,
      })
      .expect(201);
    const user = await prisma.User.where({ email: address }).first();
    if (user) users.push(user.id);
    owner = await login(address);
  });
  afterAll(async () => {
    await app?.close();
    if (prisma) {
      await cleanup();
      await prisma.db.close();
    }
  });
  it('self-signup is PENDING: session/status/logout only, even with forged ACTIVE claims', async () => {
    const company = await signup();
    expect(
      (await prisma.Company.where({ id: company.id }).first())?.approvalStatus,
    ).toBe('PENDING');
    await call('get', '/auth/session', company.token)
      .expect(200)
      .expect((r) =>
        expect(r.body.data.company.approvalStatus).toBe('PENDING'),
      );
    await call('get', '/company/status', company.token).expect(200);
    const forged = jwt.sign({
      sub: company.userId,
      role: 'COMPANY_ADMIN',
      orgId: company.id,
      companyStatus: 'ACTIVE',
      typ: 'access',
    });
    for (const path of [
      '/parcels',
      '/drivers',
      '/merchants/business',
      '/company/profile',
    ])
      await call('get', path, forged).expect(403);
    await call('post', '/auth/logout', company.token).expect(200);
  });
  it.each(['SUPER_ADMIN', 'COMPANY_MANAGER', 'SUPPORT', 'BILLING'])(
    'enforces the %s company list/detail/write matrix',
    async (role) => {
      const actor = role === 'SUPER_ADMIN' ? owner : await platformStaff(role);
      const company = await signup();
      await call('get', '/platform/companies', actor).expect(
        role === 'BILLING' ? 403 : 200,
      );
      await call('get', `/platform/companies/${company.id}`, actor).expect(
        role === 'BILLING' ? 403 : 200,
      );
      await transition(company.id, 'approve', 1, undefined, actor).expect(
        ['SUPER_ADMIN', 'COMPANY_MANAGER'].includes(role) ? 201 : 403,
      );
      await call('get', '/platform/companies', company.token).expect(403);
      const write = ['SUPER_ADMIN', 'COMPANY_MANAGER'].includes(role);
      const rejection = await signup('Rejection matrix');
      await transition(
        rejection.id,
        'reject',
        1,
        'Registration incomplete',
        actor,
      ).expect(write ? 201 : 403);
      const creation = await call('post', '/platform/companies', actor)
        .send({
          name: 'Role matrix company',
          currency: 'ILS',
          adminName: 'Primary admin',
          adminEmail: email(),
        })
        .expect(write ? 201 : 403);
      if (write) companies.push(creation.body.data.company.id);
      await transition(
        company.id,
        'suspend',
        2,
        'Security review',
        actor,
      ).expect(write ? 201 : 403);
      await transition(company.id, 'reactivate', 3, undefined, actor).expect(
        write ? 201 : 403,
      );
      await call(
        'post',
        `/platform/companies/${write ? creation.body.data.company.id : company.id}/admin-invitation`,
        actor,
      )
        .send({})
        .expect(write ? 201 : 403);
    },
  );
  it('rejects with reason, lets only the tenant administrator edit/resubmit and detects stale revisions', async () => {
    const company = await signup(),
      other = await signup('Other company');
    await transition(company.id, 'reject', 1).expect(400);
    await transition(
      company.id,
      'reject',
      1,
      'Confirm the company address',
    ).expect(201);
    await call('get', '/company/status', company.token)
      .expect(200)
      .expect((r) =>
        expect(r.body.data.company.rejectionReason).toBe(
          'Confirm the company address',
        ),
      );
    await call('post', '/company/status/resubmit', other.token)
      .set('X-Fleetora-Company-Context', company.id)
      .send({
        revision: 2,
        name: 'Changed',
        phone: '0590000000',
        address: 'Corrected address',
      })
      .expect(403);
    await call('post', '/company/status/resubmit', company.token)
      .set('X-Fleetora-Company-Context', company.id)
      .send({ revision: 1, name: 'Changed' })
      .expect(409);
    await call('post', '/company/status/resubmit', company.token)
      .set('X-Fleetora-Company-Context', company.id)
      .send({
        revision: 2,
        name: 'Changed',
        phone: '0590000000',
        address: 'Corrected address',
      })
      .expect(201);
    const stored = await prisma.Company.where({ id: company.id }).first();
    expect(stored).toMatchObject({
      name: 'Changed',
      approvalStatus: 'PENDING',
      rejectionReason: null,
      revision: 3,
    });
    await transition(company.id, 'approve', 3).expect(201);
    await call('get', '/parcels', company.token).expect(200);
    await call('patch', '/company/profile', company.token)
      .set('X-Fleetora-Company-Context', company.id)
      .send({
        revision: 4,
        name: 'Approved name',
        phone: '0560000000',
        address: 'Basic address',
      })
      .expect(200);
    for (const protectedField of [
      'currency',
      'plan',
      'approvalStatus',
      'suspended',
    ])
      await call('patch', '/company/profile', company.token)
        .set('X-Fleetora-Company-Context', company.id)
        .send({ revision: 5, name: 'Attempt', [protectedField]: 'ACTIVE' })
        .expect(400);
    await call('get', '/company/profile', owner).expect(403);
    await prisma.User.where({ id: company.userId }).update({
      role: 'OPERATIONS',
    });
    await call('get', '/company/status', company.token).expect(200);
    await call('get', '/company/profile', company.token).expect(403);
    await call('post', '/company/status/resubmit', company.token)
      .set('X-Fleetora-Company-Context', company.id)
      .send({ revision: 5, name: 'Escalation' })
      .expect(403);
  });
  it('creates a company and inactive primary admin atomically, activates by fragment invitation and refuses duplicate account adoption', async () => {
    const address = email();
    const response = await call('post', '/platform/companies')
      .send({
        name: 'Direct company',
        currency: 'ILS',
        adminName: 'Primary admin',
        adminEmail: address,
      })
      .expect(201);
    const company = response.body.data.company;
    companies.push(company.id);
    const user = await prisma.User.where({ email: address }).first();
    if (!user) throw new Error('Missing primary admin');
    users.push(user.id);
    expect(user).toMatchObject({
      companyId: company.id,
      role: 'COMPANY_ADMIN',
      isActive: false,
      isEmailVerified: false,
    });
    expect(
      (await prisma.Company.where({ id: company.id }).first())?.primaryAdminId,
    ).toBe(user.id);
    const url = mail.sendInvitationEmail.mock.calls.at(-1)![0].url;
    expect(new URL(url).pathname).toBe('/company/activate');
    expect(new URL(url).search).toBe('');
    const token = tokenOf(url);
    expect(
      (
        await prisma.db.orm.public.CompanyAdminInvitation.where({
          companyId: company.id,
        }).first()
      )?.tokenHash,
    ).not.toBe(token);
    await api()
      .post('/company/admin-invitations/accept')
      .send({ token, name: 'Primary admin', password })
      .expect(201);
    await api()
      .post('/company/admin-invitations/accept')
      .send({ token, name: 'Primary admin', password })
      .expect(400);
    const adminToken = await login(address);
    await call('get', '/company/profile', adminToken).expect(200);
    const count = (await prisma.Company.all()).length;
    await call('post', '/platform/companies')
      .send({
        name: 'Must roll back',
        currency: 'ILS',
        adminName: 'Duplicate',
        adminEmail: address,
      })
      .expect(409);
    expect((await prisma.Company.all()).length).toBe(count);
  });
  it('searches names with Arabic normalization, paginates in SQL and exposes no operational data', async () => {
    for (const name of ['أَحْـمد للنقل', 'شركة بعيدة']) {
      const company = await signup(name);
      await prisma.Company.where({ id: company.id }).update({ name });
    }
    const result = await call(
      'get',
      '/platform/companies?search=احمد&pageSize=1&page=1&status=PENDING',
    ).expect(200);
    expect(result.body.data.items).toHaveLength(1);
    expect(result.body.data.items[0].name).toBe('أَحْـمد للنقل');
    const detail = await call(
      'get',
      `/platform/companies/${result.body.data.items[0].id}`,
    ).expect(200);
    for (const key of [
      'shipments',
      'merchants',
      'workers',
      'balances',
      'collections',
      'settlements',
      'password',
      'refreshToken',
    ])
      expect(detail.body.data.company).not.toHaveProperty(key);
    await call('get', '/platform/companies?pageSize=101').expect(400);
  });
  it('suspension serializes after an in-flight company write, preserves obligations and invalidates old sessions after reactivation', async () => {
    const company = await signup();
    await transition(company.id, 'approve', 1).expect(201);
    const merchant = await prisma.db.orm.public.Merchant.create({
      companyId: company.id,
      name: 'Existing merchant',
      contactName: 'Owner',
      phone: '0591234567',
      pickupAddress: 'Existing address',
      city: 'Nablus',
      currency: 'ILS',
      deliveryFeeMinor: 200n,
      returnFeeMinor: 100n,
      feePayer: 'MERCHANT',
      activationStatus: 'ACTIVE',
      legacyActivation: true,
    });
    const shipment = await prisma.Shipment.create({
      companyId: company.id,
      requestedBy: company.userId,
      merchantId: merchant.id,
      destination: 'Existing destination',
      status: 'OUT_FOR_DELIVERY',
      custody: 'DRIVER',
      codMinor: 10000n,
    });
    const collection = await prisma.db.orm.public.CodCollection.create({
      companyId: company.id,
      shipmentId: shipment.id,
      merchantId: merchant.id,
      currency: 'ILS',
      amountMinor: 10000n,
      goodsMinor: 9800n,
      method: 'CASH',
      recordedBy: company.userId,
    });
    const settlement = await prisma.db.orm.public.MerchantSettlement.create({
      companyId: company.id,
      merchantId: merchant.id,
      currency: 'ILS',
      grossCollectedMinor: 10000n,
      deliveryFeesMinor: 200n,
      returnFeesMinor: 0n,
      adjustmentsMinor: 0n,
      netPayableMinor: 9800n,
      createdBy: company.userId,
    });
    const actor = await app
      .get(AccessTokenStrategy)
      .validate(jwt.decode(company.token));
    let entered!: () => void, release!: () => void;
    const inside = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = app
      .get(ParcelStore)
      .write(actor, 'manageDrivers', async (tx, companyId) => {
        entered();
        await barrier;
        return tx.orm.public.Worker.create({
          companyId,
          fullName: 'Existing custody driver',
          phone: '0591234567',
        });
      });
    await inside;
    const suspension = transition(
      company.id,
      'suspend',
      2,
      'Security review',
    ).then((r) => r);
    release();
    const driver = await write;
    expect((await suspension).status).toBe(201);
    expect(
      (await prisma.Worker.where({ id: driver.id }).first())?.fullName,
    ).toBe('Existing custody driver');
    expect(await prisma.Shipment.where({ id: shipment.id }).first()).toEqual(
      shipment,
    );
    expect(
      await prisma.db.orm.public.CodCollection.where({
        id: collection.id,
      }).first(),
    ).toEqual(collection);
    expect(
      await prisma.db.orm.public.MerchantSettlement.where({
        id: settlement.id,
      }).first(),
    ).toEqual(settlement);
    await call('get', '/parcels', company.token).expect(401);
    expect(
      (await prisma.User.where({ id: company.userId }).first())?.refreshToken,
    ).toBeNull();
    await transition(company.id, 'reactivate', 3).expect(201);
    await call('get', '/parcels', company.token).expect(401);
    const fresh = await login(company.email);
    await call('get', '/parcels', fresh).expect(200);
    const events = await prisma.db.orm.public.CompanyAccessEvent.where({
      companyId: company.id,
    }).all();
    expect(events.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        'COMPANY_APPROVED',
        'COMPANY_SUSPENDED',
        'COMPANY_REACTIVATED',
      ]),
    );
  });
  it('rechecks approval and access version inside operational write transactions', async () => {
    const company = await signup();
    const actor = await app
      .get(AccessTokenStrategy)
      .validate(jwt.decode(company.token));
    const operation = vi.fn(async () => true);
    await expect(
      app
        .get(ParcelStore)
        .write(
          { ...actor, companyStatus: 'ACTIVE' },
          'manageDrivers',
          operation,
        ),
    ).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
    await transition(company.id, 'approve', 1).expect(201);
    await transition(company.id, 'suspend', 2, 'Security').expect(201);
    await transition(company.id, 'reactivate', 3).expect(201);
    await expect(
      app.get(ParcelStore).write(actor, 'manageDrivers', operation),
    ).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
  });
  it('serializes competing approvals and suspensions and rechecks persisted platform authority', async () => {
    const company = await signup();
    const approvals = await Promise.all([
      transition(company.id, 'approve', 1),
      transition(company.id, 'approve', 1),
    ]);
    expect(approvals.map((r) => r.status).sort()).toEqual([201, 409]);
    const suspensions = await Promise.all([
      transition(company.id, 'suspend', 2, 'Security A'),
      transition(company.id, 'suspend', 2, 'Security B'),
    ]);
    expect(suspensions.map((r) => r.status).sort()).toEqual([201, 409]);
    const manager = await platformStaff('COMPANY_MANAGER'),
      identity = await app
        .get(AccessTokenStrategy)
        .validate(jwt.decode(manager));
    await prisma.db.orm.public.PlatformStaff.where({
      userId: identity.sub,
    }).update({ role: 'SUPPORT' });
    await expect(
      app.get(CompaniesRepository).transition(identity, company.id, {
        action: 'reactivate',
        revision: 3,
      }),
    ).rejects.toThrow('Company platform permission required');
    await call('get', '/company/status', manager).expect(403);
  });
  it('expires and revokes primary-admin invitations, and lets only one concurrent acceptance succeed', async () => {
    const address = email();
    const response = await call('post', '/platform/companies')
      .send({
        name: 'Invitation company',
        currency: 'ILS',
        adminName: 'Primary admin',
        adminEmail: address,
      })
      .expect(201);
    const companyId = response.body.data.company.id;
    companies.push(companyId);
    const first = tokenOf(response.body.data.activationUrl);
    const fresh = await call(
      'post',
      `/platform/companies/${companyId}/admin-invitation`,
    )
      .send({})
      .expect(201);
    await api()
      .post('/company/admin-invitations/accept')
      .send({ token: first, name: 'Primary admin', password })
      .expect(400);
    const second = tokenOf(fresh.body.data.activationUrl);
    await prisma.db.orm.public.CompanyAdminInvitation.where({
      companyId,
      revokedAt: null,
      acceptedAt: null,
    }).update({ expiresAt: Temporal.Now.instant().subtract({ hours: 1 }) });
    await api()
      .post('/company/admin-invitations/accept')
      .send({ token: second, name: 'Primary admin', password })
      .expect(400)
      .expect((r) => expect(r.body.message).toBe('Invitation expired'));
    const renewed = await call(
        'post',
        `/platform/companies/${companyId}/admin-invitation`,
      )
        .send({})
        .expect(201),
      token = tokenOf(renewed.body.data.activationUrl);
    const accepts = await Promise.all([
      api()
        .post('/company/admin-invitations/accept')
        .send({ token, name: 'Primary admin', password }),
      api()
        .post('/company/admin-invitations/accept')
        .send({ token, name: 'Primary admin', password }),
    ]);
    expect(accepts.map((r) => r.status).sort()).toEqual([201, 400]);
  });
  it('does not revive a revoked company session when an in-flight sign-in saves its refresh token after suspension', async () => {
    const company = await signup();
    await transition(company.id, 'approve', 1).expect(201);
    const repository = app.get(AuthRepository),
      original = repository.updateRefreshToken.bind(repository);
    let entered!: () => void, release!: () => void;
    const inside = new Promise<void>((resolve) => {
        entered = resolve;
      }),
      barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
    const saving = vi
      .spyOn(repository, 'updateRefreshToken')
      .mockImplementation(async (id, verifier) => {
        if (id === company.userId) {
          entered();
          await barrier;
        }
        return original(id, verifier);
      });
    const signin = api()
      .post('/auth/signin')
      .send({ email: company.email, password })
      .then((response) => response);
    try {
      await inside;
      await transition(company.id, 'suspend', 2, 'Security review').expect(201);
      release();
      const delayed = await signin;
      expect(delayed.status).toBe(200);
      await transition(company.id, 'reactivate', 3).expect(201);
      await call('get', '/parcels', delayed.body.data.accessToken).expect(401);
      await api()
        .post('/auth/refresh')
        .auth(delayed.body.data.refreshToken, { type: 'bearer' })
        .expect(401);
      const fresh = await api()
        .post('/auth/signin')
        .send({ email: company.email, password })
        .expect(200);
      await api()
        .post('/auth/refresh')
        .auth(fresh.body.data.refreshToken, { type: 'bearer' })
        .expect(200);
    } finally {
      release();
      saving.mockRestore();
    }
  });
  it('reactivates grandfathered suspended companies without reviving pre-migration sessions', async () => {
    const company = await signup();
    await transition(company.id, 'approve', 1).expect(201);
    const signed = await api()
      .post('/auth/signin')
      .send({ email: company.email, password })
      .expect(200);
    // Before lifecycle versioning, suspension was only a boolean and left session verifiers intact.
    await prisma.Company.where({ id: company.id }).update({ suspended: true });
    await transition(company.id, 'reactivate', 2).expect(201);
    await call('get', '/parcels', signed.body.data.accessToken).expect(401);
    await api()
      .post('/auth/refresh')
      .auth(signed.body.data.refreshToken, { type: 'bearer' })
      .expect(401);
    const fresh = await api()
      .post('/auth/signin')
      .send({ email: company.email, password })
      .expect(200);
    await call('get', '/parcels', fresh.body.data.accessToken).expect(200);
  });
  it('disconnects a live company socket on suspension and rejects old connection tickets', async () => {
    const company = await signup();
    await transition(company.id, 'approve', 1).expect(201);
    const ticket = (
      await call('post', '/fleet/socket-ticket', company.token)
        .set('X-Fleetora-Company-Context', company.id)
        .expect(201)
    ).body.data.ticket;
    const socket: Socket = io(`${await app.getUrl()}/fleet`, {
      transports: ['websocket'],
      extraHeaders: { Origin: 'https://example.invalid' },
      auth: { ticket },
      autoConnect: false,
      reconnection: false,
    });
    try {
      const ready = new Promise<void>((resolve, reject) => {
        socket.once('fleet:ready', () => resolve());
        socket.once('connect_error', reject);
      });
      socket.connect();
      await ready;
      const disconnected = new Promise<void>((resolve) =>
        socket.once('disconnect', () => resolve()),
      );
      await transition(company.id, 'suspend', 2, 'Security review').expect(201);
      await disconnected;
      expect(socket.connected).toBe(false);
    } finally {
      socket.disconnect();
    }
  });
});
