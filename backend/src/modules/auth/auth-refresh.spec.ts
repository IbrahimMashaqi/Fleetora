import 'temporal-polyfill/full/global';
import { Temporal } from 'temporal-polyfill';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthRepository } from './auth.repository.js';
import { TokenService } from './token/token.service.js';
import { AccessTokenStrategy } from './strategies/access-token.strategy.js';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy.js';
import { MailService } from '../mail/mail.service.js';
import { RECOVERY_RATE_LIMITER } from './recovery-rate-limiter.js';
import { SIGNIN_RATE_LIMITER } from './signin-rate-limiter.js';
import { ClientSourceService } from './client-source.js';
import { HttpExceptionFilter } from '../../common/exceptions-filter/http-exception.filter.js';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor.js';

type StoredUser = NonNullable<Awaited<ReturnType<AuthRepository['findUserById']>>>;
const userId = '11111111-1111-4111-8111-111111111111';
const companyId = '22222222-2222-4222-8222-222222222222';
const password = 'ExistingPassword1';
const accessSecret = 'refresh-http-test-access-only';
const refreshSecret = 'refresh-http-test-refresh-only';

// Real controller, guards, TokenService, AuthService and crypto; persistence is in memory.
describe('real JWT authentication HTTP contracts (in-memory persistence)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let user: StoredUser;
  let companySuspended = false;
  let tail = Promise.resolve();

  beforeAll(async () => {
    const repository = {
      findUserById: async (id: string) => id === user.id ? { ...user } : null, // fresh row, like the database
      findUserByEmail: async (email: string) => email === user.email ? user : null,
      isCompanyActiveForUser: async () => !companySuspended,
      findSessionContextById: async () => ({ ...user, company: { id: companyId, name: 'Fixture Company', suspended: companySuspended } }),
      updateRefreshToken: async (_id: string, value: string | null) => { await tail; user.refreshToken = value; },
      // Compare-and-swap like the real repository, serialized with refresh rotation.
      replacePasswordAndSession(_id: string, expected: string, password: string, verifier: string) {
        const result = tail.then(() => {
          if (user.password !== expected) return false;
          user.password = password; user.refreshToken = verifier;
          return true;
        });
        tail = result.then(() => undefined, () => undefined);
        return result;
      },
      withRefreshTokenLock<T>(_id: string, operation: (account: StoredUser | null, save: (value: string | null) => Promise<void>, active: boolean) => Promise<T>): Promise<T> {
        const result = tail.then(() => operation(user, async value => { user.refreshToken = value; }, !companySuspended));
        tail = result.then(() => undefined, () => undefined);
        return result;
      },
    };
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({}), PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AuthController],
      providers: [AuthService, TokenService, AccessTokenStrategy, RefreshTokenStrategy,
        { provide: AuthRepository, useValue: repository },
        { provide: MailService, useValue: {} },
        { provide: RECOVERY_RATE_LIMITER, useValue: { consume: () => ({ allowed: true, retryAfterSeconds: 0 }) } },
        { provide: SIGNIN_RATE_LIMITER, useValue: { consume: () => ({ allowed: true, retryAfterSeconds: 0 }), release: () => undefined } },
        { provide: ClientSourceService, useValue: new ClientSourceService(new ConfigService({})) },
        { provide: ConfigService, useValue: new ConfigService({ ACCESS_TOKEN_SECRET: accessSecret, REFRESH_TOKEN_SECRET: refreshSecret, SALT_ROUNDS: 4 }) },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, validationError: { target: false, value: false } }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    jwt = module.get(JwtService);
  });

  beforeEach(async () => {
    tail = Promise.resolve(); companySuspended = false;
    user = {
      id: userId, companyId, fullName: 'Fixture User', email: 'refresh@example.invalid',
      password: await bcrypt.hash(password, 4), role: 'COMPANY_ADMIN',
      isActive: true, isEmailVerified: true, refreshToken: null,
      verificationToken: null, verificationTokenExpiresAt: null,
      createdAt: Temporal.Now.instant(), updatedAt: Temporal.Now.instant(),
    };
  });
  afterAll(async () => app.close());

  async function signin() {
    return request(app.getHttpServer()).post('/auth/signin').send({ email: user.email, password }).expect(200);
  }
  function refresh(token?: string) {
    const call = request(app.getHttpServer()).post('/auth/refresh');
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function changePassword(accessToken: string, newPassword = 'ChangedPassword2') {
    return request(app.getHttpServer()).post('/auth/update-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ oldPassword: password, newPassword });
  }

  describe('password change (M1)', () => {
    it('revokes every earlier refresh token and returns the only valid new session', async () => {
      const first = await signin();
      const rotated = await refresh(first.body.data.refreshToken).expect(200);
      const changed = await changePassword(rotated.body.data.accessToken).expect(200);
      expect(changed.body.data).toMatchObject({ success: true, message: 'Password updated successfully' });
      expect(changed.body.data.accessToken).toEqual(expect.any(String));
      expect(changed.body.data.refreshToken).toEqual(expect.any(String));
      await refresh(first.body.data.refreshToken).expect(403);
      await refresh(rotated.body.data.refreshToken).expect(403);
      await refresh(changed.body.data.refreshToken).expect(200);
      expect(await bcrypt.compare('ChangedPassword2', user.password)).toBe(true);
    });

    it('never leaves a pre-change refresh token usable when a refresh races the change', async () => {
      const login = await signin();
      const [raced, changed] = await Promise.all([
        refresh(login.body.data.refreshToken),
        changePassword(login.body.data.accessToken),
      ]);
      expect(changed.status).toBe(200);
      await refresh(login.body.data.refreshToken).expect(403);
      if (raced.status === 200) await refresh(raced.body.data.refreshToken).expect(403);
      await refresh(changed.body.data.refreshToken).expect(200);
    });

    it('applies only one of two concurrent changes made with the same old password', async () => {
      const login = await signin();
      const results = await Promise.all([
        changePassword(login.body.data.accessToken, 'FirstChange3'),
        changePassword(login.body.data.accessToken, 'SecondChange4'),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
      const winner = results.find((result) => result.status === 200)!;
      await refresh(winner.body.data.refreshToken).expect(200);
    });

    it('does not revoke sessions when the current password is wrong', async () => {
      const login = await signin();
      await request(app.getHttpServer()).post('/auth/update-password')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .send({ oldPassword: 'NotThePassword1', newPassword: 'ChangedPassword2' })
        .expect(400);
      await refresh(login.body.data.refreshToken).expect(200);
    });

    // Documented residual window: access tokens are stateless for up to ten minutes.
    it('keeps an already-issued access token valid only until its short expiry', async () => {
      const login = await signin();
      await changePassword(login.body.data.accessToken).expect(200);
      const claims = await jwt.verifyAsync(login.body.data.accessToken, { secret: accessSecret });
      expect(claims.exp - claims.iat).toBe(600);
      await request(app.getHttpServer()).get('/auth/session')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`).expect(200);
    });
  });

  it('rotates a real current JWT and rejects its replay', async () => {
    const login = await signin();
    const oldToken = login.body.data.refreshToken;
    const rotated = await refresh(oldToken).expect(200);
    expect(rotated.body.data.refreshToken).not.toBe(oldToken);
    expect(user.refreshToken).toMatch(/^refresh:sha256:v1:[a-f0-9]{64}$/);
    expect(user.refreshToken).not.toContain(rotated.body.data.refreshToken);
    await refresh(oldToken).expect(403);
    await refresh(rotated.body.data.refreshToken).expect(200);
  });

  it('rejects a prior login token after a new signin', async () => {
    const first = await signin();
    const second = await signin();
    expect(second.body.data.refreshToken).not.toBe(first.body.data.refreshToken);
    await refresh(first.body.data.refreshToken).expect(403);
    await refresh(second.body.data.refreshToken).expect(200);
  });

  it('allows at most one rotation of concurrently submitted current JWTs', async () => {
    const login = await signin();
    const results = await Promise.all([refresh(login.body.data.refreshToken), refresh(login.body.data.refreshToken)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 403]);
  });

  it('logout revokes refresh and later signin never reactivates the old JWT', async () => {
    const login = await signin();
    await request(app.getHttpServer()).post('/auth/logout').set('Authorization', `Bearer ${login.body.data.accessToken}`).expect(200);
    expect(user.refreshToken).toBeNull();
    await refresh(login.body.data.refreshToken).expect(403);
    await signin();
    await refresh(login.body.data.refreshToken).expect(403);
  });

  it('rejects legacy bcrypt refresh state with the approved reauthentication response', async () => {
    const login = await signin();
    user.refreshToken = await bcrypt.hash(login.body.data.refreshToken, 4);
    await refresh(login.body.data.refreshToken).expect(401);
  });

  for (const state of ['inactive', 'unverified', 'suspended'] as const) {
    it(`blocks refresh for ${state} account/company state`, async () => {
      const login = await signin();
      if (state === 'inactive') user.isActive = false;
      if (state === 'unverified') user.isEmailVerified = false;
      if (state === 'suspended') companySuspended = true;
      await refresh(login.body.data.refreshToken).expect(401);
    });
  }

  it.each([
    ['an access-typed token signed with the refresh secret', { typ: 'access' }],
    ['a refresh-secret token without an explicit type', {}],
  ])('rejects %s without rotating the session', async (_name, claims) => {
    await signin();
    const token = await jwt.signAsync({ sub: userId, jti: 'fixture', ...claims }, { secret: refreshSecret, expiresIn: 60 });
    const before = user.refreshToken;
    await refresh(token).expect(401);
    expect(user.refreshToken).toBe(before);
  });

  for (const kind of ['missing', 'malformed', 'invalid-signature', 'expired', 'access-token'] as const) {
    it(`rejects ${kind} refresh credentials through the real JWT guard`, async () => {
      const login = await signin();
      let token: string | undefined;
      if (kind === 'malformed') token = 'not-a-jwt';
      if (kind === 'access-token') token = login.body.data.accessToken;
      if (kind === 'invalid-signature' || kind === 'expired') {
        token = await jwt.signAsync({ sub: userId, jti: 'fixture' }, {
          secret: kind === 'invalid-signature' ? 'wrong-test-secret' : refreshSecret,
          expiresIn: kind === 'expired' ? -1 : 60,
        });
      }
      const before = user.refreshToken;
      await refresh(token).expect(401);
      expect(user.refreshToken).toBe(before);
    });
  }
});
