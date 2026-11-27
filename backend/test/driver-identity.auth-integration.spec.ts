import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import {
  Global,
  Module,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaModule } from '../src/modules/prisma/prisma.module.js';
import { AuthModule } from '../src/modules/auth/auth.module.js';
import { DriverIdentityModule } from '../src/modules/drivers/driver-identity.module.js';
import { DriversModule } from '../src/modules/drivers/drivers.module.js';
import { StaffModule } from '../src/modules/staff/staff.module.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { PersistedDriverIdentityVerifier } from '../src/modules/fleet/driver-identity.verifier.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { DriverIdentityRepository } from '../src/modules/drivers/driver-identity.repository.js';
import { DriversRepository } from '../src/modules/drivers/drivers.repository.js';
import { DriverIdentityService } from '../src/modules/drivers/driver-identity.service.js';
import { DriverAuthService } from '../src/modules/drivers/driver-auth.service.js';
import { TokenService } from '../src/modules/auth/token/token.service.js';
import { AccessTokenStrategy } from '../src/modules/auth/strategies/access-token.strategy.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import type { TokenPayload } from '../src/modules/auth/token/token.payload.js';
import { Temporal } from 'temporal-polyfill';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';

class DriverTestMailModule {}
Global()(DriverTestMailModule);
Module({
  providers: [{ provide: MailService, useValue: {} }],
  exports: [MailService],
})(DriverTestMailModule);

describe('BR-035/043/117/118 driver identity on disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  const companies: string[] = [];
  let app: INestApplication;
  let prisma: PrismaService,
    service: DriverIdentityService,
    login: DriverAuthService,
    strategy: AccessTokenStrategy;
  let actor: TokenPayload, foreign: TokenPayload, workerId: string;
  const password = 'Driver123';
  const config = new ConfigService({
    SALT_ROUNDS: 4,
    FRONTEND_URL: 'https://fleetora.example.invalid',
    ACCESS_TOKEN_SECRET: 'driver-integration-access-secret-0123456789',
    REFRESH_TOKEN_SECRET: 'driver-integration-refresh-secret-0123456789',
  });
  const jwt = new JwtService();
  const invite = () => service.issue(actor, workerId);
  const tokenOf = (issued: { url: string }) =>
    new URLSearchParams(new URL(issued.url).hash.slice(1)).get('token')!;
  async function identity() {
    const company = await prisma.Company.create({
      name: 'Driver identity fixture',
    });
    companies.push(company.id);
    const user = await prisma.User.create({
      companyId: company.id,
      fullName: 'Driver administrator',
      role: 'COMPANY_ADMIN',
      password: randomUUID(),
      isActive: true,
      isEmailVerified: true,
    });
    return {
      sub: user.id,
      orgId: company.id,
      email: '',
      role: 'COMPANY_ADMIN' as const,
    };
  }
  async function cleanup() {
    guard.assertVerified();
    for (const companyId of companies) {
      await prisma.db.orm.public.DriverAccessEvent.where({
        companyId,
      }).deleteAll();
      await prisma.db.orm.public.DriverInvitation.where({
        companyId,
      }).deleteAll();
      await prisma.db.orm.public.DriverAccount.where({ companyId }).deleteAll();
      await prisma.Worker.where({ companyId }).deleteAll();
      await prisma.User.where({ companyId }).deleteAll();
      await prisma.Company.where({ id: companyId }).delete();
    }
    companies.length = 0;
  }
  beforeAll(async () => {
    prisma = new PrismaService();
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    const repository = new DriverIdentityRepository(prisma);
    service = new DriverIdentityService(repository, config);
    login = new DriverAuthService(
      repository,
      new TokenService(jwt, config),
      config,
    );
    strategy = new AccessTokenStrategy(config, new AuthRepository(prisma));
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PrismaModule,
        DriverTestMailModule,
        AuthModule,
        DriverIdentityModule,
        DriversModule,
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
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    await cleanup();
    actor = await identity();
    foreign = await identity();
    workerId = (
      await prisma.Worker.create({
        companyId: actor.orgId,
        fullName: 'Existing Worker',
        phone: '0591234567',
        status: 'OFFLINE',
      })
    ).id;
  });
  afterAll(async () => {
    await app?.close();
    if (prisma) {
      await cleanup();
      await prisma.db.close();
    }
  });
  it('leaves existing Workers unlinked, hashes the token and activates one explicit Worker', async () => {
    expect(
      await prisma.db.orm.public.DriverAccount.where({ workerId }).all(),
    ).toHaveLength(0);
    const issued = await invite();
    const token = tokenOf(issued);
    expect(new URL(issued.url).protocol).toBe('https:');
    expect(new URL(issued.url).search).toBe('');
    const row = await prisma.db.orm.public.DriverInvitation.where({
      workerId,
    }).first();
    expect(row?.tokenHash).not.toBe(token);
    await service.accept({ token, password });
    const session = await login.signin('00970591234567', password);
    expect(session.user).toMatchObject({
      role: 'DRIVER',
      workerId,
      orgId: actor.orgId,
    });
    expect(
      await strategy.validate(jwt.decode(session.accessToken)),
    ).toMatchObject({ role: 'DRIVER', orgId: actor.orgId });
    await expect(service.accept({ token, password })).rejects.toMatchObject({
      status: 400,
    });
  });
  it('loads access for duplicate-phone Workers without linking either and reports an account collision without disclosing its owner', async () => {
    const duplicate = await prisma.Worker.create({
      companyId: actor.orgId,
      fullName: 'Other Worker same phone',
      phone: '+970591234567',
    });
    expect(await service.overview(actor, duplicate.id)).toMatchObject({
      linked: false,
      invitationBlockedReason: null,
    });
    await service.accept({ token: tokenOf(await invite()), password });
    const bearer = await new TokenService(jwt, config).generateAccessToken(
      actor,
    );
    const response = await request(app.getHttpServer())
      .get(`/drivers/${duplicate.id}/access`)
      .auth(bearer, { type: 'bearer' })
      .expect(200);
    expect(response.body.data).toEqual({
      companyId: actor.orgId,
      workerId: duplicate.id,
      phone: duplicate.phone,
      linked: false,
      accessActive: false,
      offboarded: false,
      pendingInvitation: null,
      invitationBlockedReason: 'PHONE_IN_USE',
    });
    expect(await service.overview(actor, workerId)).toMatchObject({
      linked: true,
      invitationBlockedReason: null,
    });
    await expect(service.issue(actor, duplicate.id)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      await prisma.db.orm.public.DriverAccount.where({
        workerId: duplicate.id,
      }).all(),
    ).toEqual([]);
    await request(app.getHttpServer())
      .get(`/drivers/${duplicate.id}/access`)
      .auth(await new TokenService(jwt, config).generateAccessToken(foreign), {
        type: 'bearer',
      })
      .expect(404);
  });
  it('reports globally occupied phones without exposing a foreign account and keeps invalid legacy phones readable', async () => {
    await service.accept({ token: tokenOf(await invite()), password });
    const duplicate = await prisma.Worker.create({
      companyId: foreign.orgId,
      fullName: 'Foreign duplicate',
      phone: '00970591234567',
    });
    const overview = await service.overview(foreign, duplicate.id);
    expect(overview).toMatchObject({
      companyId: foreign.orgId,
      linked: false,
      invitationBlockedReason: 'PHONE_IN_USE',
    });
    expect(JSON.stringify(overview)).not.toContain(workerId);
    await prisma.Worker.where({ id: duplicate.id }).update({
      phone: 'legacy-invalid',
    });
    expect(await service.overview(foreign, duplicate.id)).toMatchObject({
      linked: false,
      invitationBlockedReason: 'INVALID_PHONE',
    });
  });
  it('warns about same-company normalized duplicate phones, excludes the edited Worker and scopes all checks to persisted identity', async () => {
    const bearer = await new TokenService(jwt, config).generateAccessToken(actor);
    const check = (phone: string, excludeId?: string) => request(app.getHttpServer())
      .get('/drivers/phone-check').auth(bearer, { type: 'bearer' }).query({ phone, ...(excludeId ? { excludeId } : {}) });
    expect((await check('+970 (59) 123-4567').expect(200)).body.data).toEqual({ companyId: actor.orgId, duplicate: true });
    expect((await check('00970591234567', workerId).expect(200)).body.data.duplicate).toBe(false);
    expect((await check('+972591234567').expect(200)).body.data.duplicate).toBe(false);
    const duplicate = await prisma.Worker.create({ companyId: actor.orgId, fullName: 'Duplicate phone Worker', phone: '00970 59 123 4567' });
    expect((await check('0591234567', workerId).expect(200)).body.data.duplicate).toBe(true);
    const foreignWorker = await prisma.Worker.create({ companyId: foreign.orgId, fullName: 'Foreign phone Worker', phone: '0569876543' });
    expect((await check('+970569876543').query({ companyId: foreign.orgId }).expect(200)).body.data.duplicate).toBe(false);
    await check('0591234567', foreignWorker.id).expect(404);
    await check('invalid').expect(400);
    for (const role of ['OPERATIONS', 'ACCOUNTANT', 'WAREHOUSE', 'MERCHANT'] as const) {
      await prisma.User.where({ id: actor.sub }).update({ role });
      await check('0591234567').expect(role === 'OPERATIONS' ? 200 : 403);
    }
    expect(await prisma.db.orm.public.DriverAccount.where({ workerId: duplicate.id }).all()).toEqual([]);
  });
  it('issues HTTP fragment invitations only for approved development loopback origins', async () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      const development = new DriverIdentityService(new DriverIdentityRepository(prisma), new ConfigService({ NODE_ENV: 'development', SALT_ROUNDS: 4, FRONTEND_URL: `http://${host}:3000` }));
      const issued = await development.issue(actor, workerId);
      const url = new URL(issued.url);
      expect(url.origin).toBe(`http://${host}:3000`);
      expect(url.search).toBe('');
      expect(url.hash).toMatch(/^#token=[a-f0-9]{64}$/);
    }
  });
  it('accepts a token only once under concurrency', async () => {
    const token = tokenOf(await invite());
    const result = await Promise.allSettled([
      service.accept({ token, password }),
      service.accept({ token, password }),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.db.orm.public.DriverAccount.where({ workerId }).all(),
    ).toHaveLength(1);
  });
  it('revokes older invitations on reissue and rejects expired/revoked tokens', async () => {
    const first = tokenOf(await invite()),
      second = tokenOf(await invite());
    await expect(
      service.accept({ token: first, password }),
    ).rejects.toMatchObject({ status: 400 });
    await prisma.db.orm.public.DriverInvitation.where({ workerId })
      .where((i) => i.revokedAt.isNull())
      .update({ expiresAt: Temporal.Now.instant().subtract({ seconds: 1 }) });
    await expect(
      service.accept({ token: second, password }),
    ).rejects.toMatchObject({ status: 400 });
    const third = tokenOf(await invite());
    await service.revokeInvitation(actor, workerId);
    await expect(
      service.accept({ token: third, password }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('keeps login on suspension and revokes sessions immediately for security, including after reactivation', async () => {
    await service.accept({ token: tokenOf(await invite()), password });
    await new DriversRepository(prisma).setSuspended(actor, workerId, true, 'Documented operational review');
    const session = await login.signin('0591234567', password);
    await service.revokeAccess(actor, workerId);
    await expect(
      strategy.validate(jwt.decode(session.accessToken)),
    ).rejects.toMatchObject({ status: 401 });
    await expect(login.signin('0591234567', password)).rejects.toMatchObject({
      status: 401,
    });
    await service.accept({
      token: tokenOf(await invite()),
      password: 'Different123',
    });
    await expect(
      strategy.validate(jwt.decode(session.accessToken)),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      login.signin('0591234567', 'Different123'),
    ).resolves.toBeDefined();
  });
  it('offboards independently of security revocation and leaves operational history untouched', async () => {
    await service.accept({ token: tokenOf(await invite()), password });
    await service.offboard(actor, workerId, false);
    expect(
      (await prisma.Worker.where({ id: workerId }).first())?.offboardedAt,
    ).not.toBeNull();
    await expect(login.signin('0591234567', password)).resolves.toBeDefined();
    // Operational offboarding does not disable administrator-assisted recovery.
    await service.accept({
      token: tokenOf(await invite()),
      password: 'Recovered123',
    });
    await expect(
      login.signin('0591234567', 'Recovered123'),
    ).resolves.toBeDefined();
    await service.offboard(actor, workerId, true);
    await expect(login.signin('0591234567', password)).rejects.toMatchObject({
      status: 401,
    });
    expect(
      await prisma.db.orm.public.DriverAccount.where({ workerId }).all(),
    ).toHaveLength(1);
  });
  it('denies foreign Workers, forged admin claims and non-privileged staff', async () => {
    await expect(service.issue(foreign, workerId)).rejects.toMatchObject({
      status: 404,
    });
    for (const role of [
      'ACCOUNTANT',
      'WAREHOUSE',
      'MERCHANT',
      'DRIVER',
    ] as const)
      await expect(
        service.issue({ ...actor, role }, workerId),
      ).rejects.toMatchObject({ status: 403 });
    await prisma.User.where({ id: actor.sub }).update({ role: 'ACCOUNTANT' });
    await expect(invite()).rejects.toMatchObject({ status: 403 });
  });
  it('allows Operations to invite explicitly and prevents globally duplicate normalized phones', async () => {
    await prisma.User.where({ id: actor.sub }).update({ role: 'OPERATIONS' });
    actor = { ...actor, role: 'OPERATIONS' };
    await service.accept({ token: tokenOf(await invite()), password });
    const second = await prisma.Worker.create({
      companyId: foreign.orgId,
      fullName: 'Different Worker same phone',
      phone: '+970591234567',
    });
    await expect(service.issue(foreign, second.id)).rejects.toMatchObject({
      status: 409,
    });
    await expect(login.signin('0591234567', 'Wrong123')).rejects.toMatchObject({
      status: 401,
    });
    await expect(login.signin('0569999999', password)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('uses the real HTTP session/refresh boundary and denies driver tokens on every staff route', async () => {
    await service.accept({ token: tokenOf(await invite()), password });
    const signed = await request(app.getHttpServer())
      .post('/driver/auth/signin')
      .send({ phone: '00970591234567', password })
      .expect(200);
    const accessToken: string = signed.body.data.accessToken;
    const refreshToken: string = signed.body.data.refreshToken;
    const me = await request(app.getHttpServer())
      .get('/driver/auth/me')
      .auth(accessToken, { type: 'bearer' })
      .expect(200);
    expect(me.body.data).toMatchObject({
      workerId,
      companyId: actor.orgId,
      suspended: false,
    });
    for (const path of ['/drivers', '/company/staff', '/auth/session'])
      await request(app.getHttpServer())
        .get(path)
        .auth(accessToken, { type: 'bearer' })
        .expect(403);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .auth(refreshToken, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/driver/auth/refresh')
      .auth(refreshToken, { type: 'bearer' })
      .expect(200);
    await service.revokeAccess(actor, workerId);
    await request(app.getHttpServer())
      .get('/driver/auth/me')
      .auth(accessToken, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/driver/auth/signin')
      .send({ phone: '0591234567', password })
      .expect(401);
  });

  it('telemetry verifies a signed persisted driver identity and rejects fabricated proof, staff and revoked sessions', async () => {
    await service.accept({ token: tokenOf(await invite()), password });
    const signed = await login.signin('0591234567', password);
    const verifier = new PersistedDriverIdentityVerifier(
      jwt,
      strategy,
      prisma,
      config,
    );
    expect(await verifier.verify(signed.accessToken)).toEqual({
      kind: 'driver',
      workerId,
      companyId: actor.orgId,
    });
    await expect(
      verifier.verify({ kind: 'driver', workerId, companyId: actor.orgId }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      verifier.verify(
        await new TokenService(jwt, config).generateAccessToken(actor),
      ),
    ).rejects.toMatchObject({ status: 401 });
    await prisma.User.where({ id: signed.user.id }).update({ role: 'COMPANY_ADMIN' });
    await expect(verifier.verify(signed.accessToken)).rejects.toMatchObject({ status: 401 });
    await request(app.getHttpServer()).post('/driver/auth/refresh').auth(signed.refreshToken, { type: 'bearer' }).expect(401);
    await prisma.User.where({ id: signed.user.id }).update({ role: 'DRIVER' });
    await service.revokeAccess(actor, workerId);
    await expect(verifier.verify(signed.accessToken)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('validates public passwords and keeps identity/company/role server-owned despite forged fields', async () => {
    const token = tokenOf(await invite());
    await request(app.getHttpServer())
      .post('/driver/invitations/accept')
      .send({ token, password: 'weak' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/driver/invitations/accept')
      .send({
        token,
        password,
        companyId: foreign.orgId,
        workerId: randomUUID(),
        role: 'COMPANY_ADMIN',
      })
      .expect(200);
    const account = await prisma.db.orm.public.DriverAccount.where({ workerId })
      .include('user', (user) => user.select('role'))
      .first();
    expect(account).toMatchObject({
      workerId,
      companyId: actor.orgId,
      user: { role: 'DRIVER' },
    });
  });

  it('requires explicit revocation and a new invitation to change a linked login phone', async () => {
    await service.accept({ token: tokenOf(await invite()), password });
    const drivers = new DriversRepository(prisma);
    await expect(
      drivers.update(actor, workerId, {
        name: 'Driver renamed',
        phone: '0561234567',
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.revokeInvitation(actor, workerId),
    ).rejects.toMatchObject({ status: 409 });
    await service.revokeAccess(actor, workerId);
    await drivers.update(actor, workerId, {
      name: 'Driver renamed',
      phone: '0561234567',
    });
    await service.accept({
      token: tokenOf(await invite()),
      password: 'Changed123',
    });
    await expect(login.signin('0591234567', password)).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      login.signin('0561234567', 'Changed123'),
    ).resolves.toBeDefined();
  });

  it('resolves competing global phone activations with exactly one linked account', async () => {
    const first = tokenOf(await invite());
    const secondWorker = await prisma.Worker.create({
      companyId: foreign.orgId,
      fullName: 'Unrelated existing Worker',
      phone: '+970591234567',
    });
    const second = tokenOf(await service.issue(foreign, secondWorker.id));
    const results = await Promise.allSettled([
      service.accept({ token: first, password }),
      service.accept({ token: second, password }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.db.orm.public.DriverAccount.where({
        phone: '+970591234567',
      }).all(),
    ).toHaveLength(1);
  });

  it('the database rejects cross-company Worker/User links independently of application validation', async () => {
    const user = await prisma.User.create({
      companyId: foreign.orgId,
      fullName: 'Foreign driver identity',
      role: 'DRIVER',
      password: randomUUID(),
    });
    await expect(
      prisma.db.orm.public.DriverAccount.create({
        companyId: actor.orgId,
        workerId,
        userId: user.id,
        phone: '+970591234567',
      }),
    ).rejects.toThrow();
    expect(
      await prisma.db.orm.public.DriverAccount.where({ workerId }).all(),
    ).toEqual([]);
  });

  it('blocks persisted inactive issuers and suspended companies, including redemption of existing invitations', async () => {
    const token = tokenOf(await invite());
    await prisma.User.where({ id: actor.sub }).update({ isActive: false });
    await expect(invite()).rejects.toMatchObject({ status: 401 });
    await prisma.Company.where({ id: actor.orgId }).update({ suspended: true });
    await expect(service.accept({ token, password })).rejects.toMatchObject({
      status: 400,
    });
    expect(
      await prisma.db.orm.public.DriverAccount.where({ workerId }).all(),
    ).toEqual([]);
  });

  it('throttles normalized phone aliases together and ignores spoofed forwarded addresses', async () => {
    await prisma.Worker.where({ id: workerId }).update({ phone: '0569876543' });
    await service.accept({ token: tokenOf(await invite()), password });
    const phones = ['0569876543', '00970569876543', '+970569876543'];
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer())
        .post('/driver/auth/signin')
        .set('X-Forwarded-For', `198.51.100.${i + 1}`)
        .send({ phone: phones[i % phones.length], password: 'Wrong123' })
        .expect(401);
    await request(app.getHttpServer())
      .post('/driver/auth/signin')
      .send({ phone: phones[0], password })
      .expect(429);
  });
});
