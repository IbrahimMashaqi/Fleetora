import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import * as bcrypt from 'bcrypt';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { HttpExceptionFilter } from '../src/common/exceptions-filter/http-exception.filter.js';
import { AuthPostgresTestGuard, readAuthPostgresIdentity } from './auth-postgres.safety.js';

const companyId = '44444444-4444-4444-8444-444444444444';
const otherCompanyId = '55555555-5555-4555-8555-555555555555';
const userId = '66666666-6666-4666-8666-666666666666';
const email = 'phase6b-e2e@fleetora.test';
const password = 'ExistingPassword1';

// Full Nest module + guards + services + PostgreSQL. SMTP delivery is mocked.
describe('implemented authentication API (disposable PostgreSQL)', () => {
  const databaseGuard = new AuthPostgresTestGuard();
  let app: INestApplication<App>;
  let module: TestingModule;
  let prisma: PrismaService;
  const mail = { sendVerificationEmail: vi.fn().mockResolvedValue(undefined), sendResetPasswordEmail: vi.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).overrideProvider(MailService).useValue(mail).compile();
    prisma = module.get(PrismaService);
    await databaseGuard.verify(() => readAuthPostgresIdentity(prisma));
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(async () => {
    databaseGuard.assertVerified();
    await databaseGuard.verify(() => readAuthPostgresIdentity(prisma));
    vi.clearAllMocks(); await cleanup();
    await prisma.Company.create({ id: companyId, name: 'Phase6B E2E', plan: 'TRIAL', suspended: false });
    await prisma.Company.create({ id: otherCompanyId, name: 'Phase6B Other', plan: 'TRIAL', suspended: false });
    await prisma.User.create({ id: userId, companyId, email, fullName: 'HTTP User', role: 'COMPANY_ADMIN', isActive: true, isEmailVerified: true, password: await bcrypt.hash(password, 4) });
  });

  async function signin() { return request(app.getHttpServer()).post('/auth/signin').send({ email, password }).expect(200); }
  async function cleanup() {
    databaseGuard.assertVerified();
    await prisma?.Company.where({ name: "Phase6B HTTP's Company" }).delete();
    await prisma?.Company.where({ id: companyId }).delete();
    await prisma?.Company.where({ id: otherCompanyId }).delete();
  }
  afterAll(async () => {
    await databaseGuard.teardown(async () => {
      await databaseGuard.verify(() => readAuthPostgresIdentity(prisma));
      await cleanup();
    }, async () => {
      try {
        await prisma?.db.close();
      } finally {
        if (app) await app.close();
        else await module?.close();
      }
    });
  });

  it('has no obsolete root scaffold endpoint', async () => {
    await request(app.getHttpServer()).get('/').expect(404);
  });

  it('denies all implemented protected operations without credentials', async () => {
    await request(app.getHttpServer()).get('/auth/session').expect(401);
    for (const path of ['refresh', 'logout', 'update-password']) await request(app.getHttpServer()).post(`/auth/${path}`).send({ oldPassword: password, newPassword: 'NewPassword1' }).expect(401);
  });

  it('returns only authenticated company context despite a submitted other-company identifier', async () => {
    const login = await signin();
    const reply = await request(app.getHttpServer()).get(`/auth/session?companyId=${otherCompanyId}`).set('Authorization', `Bearer ${login.body.data.accessToken}`).expect(200);
    expect(reply.body).toMatchObject({ success: true, data: { id: userId, orgId: companyId, company: { id: companyId } } });
    expect(reply.body.data).not.toHaveProperty('password');
    expect(reply.body.data).not.toHaveProperty('refreshToken');
    expect(reply.body.data).not.toHaveProperty('verificationToken');
  });

  for (const state of ['inactive-user', 'suspended-company'] as const) {
    it(`rejects existing signed credentials after ${state}`, async () => {
      const login = await signin();
      if (state === 'inactive-user') await prisma.User.where({ id: userId }).update({ isActive: false });
      else await prisma.Company.where({ id: companyId }).update({ suspended: true });
      await request(app.getHttpServer()).get('/auth/session').set('Authorization', `Bearer ${login.body.data.accessToken}`).expect(401);
      await request(app.getHttpServer()).post('/auth/refresh').set('Authorization', `Bearer ${login.body.data.refreshToken}`).expect(401);
      await request(app.getHttpServer()).post('/auth/logout').set('Authorization', `Bearer ${login.body.data.accessToken}`).expect(401);
      await request(app.getHttpServer()).post('/auth/update-password').set('Authorization', `Bearer ${login.body.data.accessToken}`).send({ oldPassword: password, newPassword: 'NewPassword1' }).expect(401);
    });
  }

  it('accepts supported password updates and subsequently authenticates them', async () => {
    const login = await signin();
    for (const newPassword of ['x', 'abcdef', 'A' + 'a'.repeat(72), 'A' + 'é'.repeat(36)]) {
      const denied = await request(app.getHttpServer()).post('/auth/update-password').set('Authorization', `Bearer ${login.body.data.accessToken}`).send({ oldPassword: password, newPassword }).expect(400);
      expect(denied.body).toMatchObject({ success: false, data: null });
      expect(JSON.stringify(denied.body)).not.toContain(newPassword);
    }
    await request(app.getHttpServer()).post('/auth/update-password').set('Authorization', `Bearer ${login.body.data.accessToken}`).send({ oldPassword: password, newPassword: 'NewPassword1' }).expect(200);
    await request(app.getHttpServer()).post('/auth/signin').send({ email, password: 'NewPassword1' }).expect(200);
  });

  it('ignores submitted signup privilege fields and requires explicit POST verification', async () => {
    const signup = await request(app.getHttpServer()).post('/auth/signup').send({ name: 'Phase6B HTTP', email: 'phase6b-signup@fleetora.test', password: 'SignupPassword1', role: 'PLATFORM_ADMIN', companyId: otherCompanyId }).expect(201);
    const account = await prisma.User.where({ id: signup.body.data.userId }).first();
    if (!account) throw new Error('Signup did not persist its user');
    expect(account).toMatchObject({ role: 'COMPANY_ADMIN', isActive: true, isEmailVerified: false });
    expect(account?.companyId).not.toBe(otherCompanyId);
    expect(signup.body.data).not.toHaveProperty('password');
    expect(signup.body.data).not.toHaveProperty('refreshToken');
    const link = new URL(mail.sendVerificationEmail.mock.calls[0][2]);
    const token = new URLSearchParams(link.hash.slice(1)).get('token');
    await request(app.getHttpServer()).get('/auth/verify-email').query({ userId: account?.id, token }).expect(405);
    expect((await prisma.User.where({ id: account.id }).first())?.isEmailVerified).toBe(false);
    await request(app.getHttpServer()).post('/auth/verify-email').send({ userId: account?.id, token }).expect(200);
    await request(app.getHttpServer()).post('/auth/signin').send({ email: 'phase6b-signup@fleetora.test', password: 'SignupPassword1' }).expect(200);
  });

  it('preserves generic recovery and accepts reset credentials only once', async () => {
    const known = await request(app.getHttpServer()).post('/auth/forgot-password').send({ email }).expect(200);
    const unknown = await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'unknown-e2e@fleetora.test' }).expect(200);
    expect(known.body.data).toEqual(unknown.body.data);
    const link = new URL(mail.sendResetPasswordEmail.mock.calls[0][2]);
    const token = new URLSearchParams(link.hash.slice(1)).get('token');
    const payload = { id: userId, token, newPassword: 'ResetPassword1' };
    await request(app.getHttpServer()).post('/auth/reset-password').send(payload).expect(200);
    await request(app.getHttpServer()).post('/auth/reset-password').send(payload).expect(400);
    await request(app.getHttpServer()).post('/auth/signin').send({ email, password: 'ResetPassword1' }).expect(200);
  });

  it('rotates real JWTs and revokes refresh on logout across actual HTTP and PostgreSQL', async () => {
    const login = await signin();
    const rotated = await request(app.getHttpServer()).post('/auth/refresh').set('Authorization', `Bearer ${login.body.data.refreshToken}`).expect(200);
    await request(app.getHttpServer()).post('/auth/refresh').set('Authorization', `Bearer ${login.body.data.refreshToken}`).expect(403);
    await request(app.getHttpServer()).post('/auth/logout').set('Authorization', `Bearer ${rotated.body.data.accessToken}`).expect(200);
    await request(app.getHttpServer()).post('/auth/refresh').set('Authorization', `Bearer ${rotated.body.data.refreshToken}`).expect(403);
  });
});
