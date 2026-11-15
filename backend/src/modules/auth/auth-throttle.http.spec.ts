import { createHmac } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { UnauthorizedException, ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CLIENT_SOURCE_HEADER, ClientSourceService } from './client-source.js';
import { InMemoryRecoveryRateLimiter, RECOVERY_RATE_LIMITER } from './recovery-rate-limiter.js';
import { InMemorySigninRateLimiter, SIGNIN_RATE_LIMITER } from './signin-rate-limiter.js';
import { HttpExceptionFilter } from '../../common/exceptions-filter/http-exception.filter.js';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor.js';

const sourceSecret = 'throttle-http-test-client-source-secret-0123456789';
const password = 'Wrong-Passw0rd';

function signed(ip: string, path: string) {
  const timestamp = Date.now();
  const signature = createHmac('sha256', sourceSecret)
    .update(`fleetora-client-source\nv1\nPOST\n${path}\n${timestamp}\n${ip}`)
    .digest('hex');
  return `v1.${timestamp}.${Buffer.from(ip).toString('base64url')}.${signature}`;
}

// Every request reaches Nest from the same loopback socket, like a shared frontend server.
describe('sign-in and recovery throttling over HTTP (in-memory limiters)', () => {
  let app: INestApplication<App>;
  const auth = {
    signin: vi.fn(),
    sendForgotPasswordEmail: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    auth.signin.mockRejectedValue(new UnauthorizedException('Invalid credentials'));
    auth.sendForgotPasswordEmail.mockResolvedValue({ message: 'If an account exists for this email, password reset instructions will be sent.' });
    const config = new ConfigService({
      ACCESS_TOKEN_SECRET: 'throttle-http-test-access-secret',
      FLEETORA_CLIENT_SOURCE_SECRET: sourceSecret,
      SIGNIN_RATE_LIMIT_PAIR_MAX: 3,
      SIGNIN_RATE_LIMIT_ACCOUNT_MAX: 5,
      SIGNIN_RATE_LIMIT_SOURCE_MAX: 8,
      RECOVERY_RATE_LIMIT_PAIR_MAX: 10,
      RECOVERY_RATE_LIMIT_ACCOUNT_MAX: 10,
      RECOVERY_RATE_LIMIT_SOURCE_MAX: 3,
    });
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: ConfigService, useValue: config },
        ClientSourceService,
        { provide: RECOVERY_RATE_LIMITER, useValue: new InMemoryRecoveryRateLimiter(config) },
        { provide: SIGNIN_RATE_LIMITER, useValue: new InMemorySigninRateLimiter(config) },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });
  afterEach(async () => app.close());

  const signin = (email: string, headers: Record<string, string> = {}) =>
    request(app.getHttpServer()).post('/auth/signin').set(headers).send({ email, password });
  const recover = (email: string, headers: Record<string, string> = {}) =>
    request(app.getHttpServer()).post('/auth/forgot-password').set(headers).send({ email });
  const comparable = (body: Record<string, unknown>) => ({ ...body, timestamp: undefined });

  describe('H1 sign-in', () => {
    it('answers existing and unknown accounts identically, including the throttle response', async () => {
      const outcomes = [];
      for (const email of ['exists@example.com', 'ghost@example.com']) {
        const responses = [];
        for (let n = 0; n < 4; n++) responses.push(await signin(email));
        outcomes.push(responses.map((r) => [r.status, comparable(r.body)]));
      }
      expect(outcomes[0]).toEqual(outcomes[1]);
      expect(outcomes[0].map(([status]) => status)).toEqual([401, 401, 401, 429]);
      expect(outcomes[0][3][1]).toMatchObject({ success: false, message: 'Too many sign-in attempts. Please try again later.' });
    });

    it('reserves attempts before verifying credentials so concurrent guesses cannot bypass the limit', async () => {
      auth.signin.mockImplementation(async () => {
        await delay(25);
        throw new UnauthorizedException('Invalid credentials');
      });
      const responses = await Promise.all(Array.from({ length: 12 }, () => signin('victim@example.com')));
      expect(auth.signin).toHaveBeenCalledTimes(3);
      expect(responses.filter((r) => r.status === 429)).toHaveLength(9);
    });

    it('does not consult the account once throttled', async () => {
      for (let n = 0; n < 3; n++) await signin('victim@example.com');
      auth.signin.mockClear();
      await signin('Victim@Example.com').expect(429);
      expect(auth.signin).not.toHaveBeenCalled();
    });

    it('does not let a client rotate forwarding headers to escape its source limit', async () => {
      const statuses = [];
      for (let n = 0; n < 9; n++) {
        statuses.push((await signin(`user${n}@example.com`, { 'X-Forwarded-For': `198.51.100.${n}`, 'X-Real-IP': `198.51.100.${n}` })).status);
      }
      expect(statuses).toEqual([401, 401, 401, 401, 401, 401, 401, 401, 429]);
    });

    it('refunds successful sign-ins so legitimate repeated logins are not locked out', async () => {
      auth.signin.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: {} });
      for (let n = 0; n < 6; n++) await signin('owner@example.com').expect(200);
    });

    it('keeps each verified web client in its own sign-in source bucket', async () => {
      const a = (email: string) => signin(email, { [CLIENT_SOURCE_HEADER]: signed('198.51.100.20', '/auth/signin') });
      for (let n = 0; n < 8; n++) await a(`stuffed${n}@example.com`).expect(401);
      await a('stuffed9@example.com').expect(429);
      await signin('owner@example.com', { [CLIENT_SOURCE_HEADER]: signed('198.51.100.21', '/auth/signin') }).expect(401);
    });
  });

  describe('H2 password recovery behind a shared frontend server', () => {
    it('gives each verified web client its own source bucket', async () => {
      const client = (ip: string, email: string) => recover(email, { [CLIENT_SOURCE_HEADER]: signed(ip, '/auth/forgot-password') });
      for (let n = 0; n < 3; n++) await client('198.51.100.30', `a${n}@example.com`).expect(200);
      await client('198.51.100.30', 'a4@example.com').expect(429);
      await client('198.51.100.31', 'b0@example.com').expect(200);
      expect(auth.sendForgotPasswordEmail).toHaveBeenCalledTimes(4);
    });

    it('never lets unattributed web traffic exhaust a shared bucket', async () => {
      for (let n = 0; n < 12; n++) {
        await recover(`user${n}@example.com`, { [CLIENT_SOURCE_HEADER]: signed('', '/auth/forgot-password') }).expect(200);
      }
    });

    it('charges a forged assertion to the connection address that sent it', async () => {
      const forged = (n: number) => {
        const timestamp = Date.now();
        const signature = createHmac('sha256', 'attacker-guess-secret-0123456789abcdef').update(`x${n}`).digest('hex');
        return `v1.${timestamp}.${Buffer.from(`203.0.113.${n}`).toString('base64url')}.${signature}`;
      };
      for (let n = 0; n < 3; n++) await recover(`f${n}@example.com`, { [CLIENT_SOURCE_HEADER]: forged(n) }).expect(200);
      await recover('f9@example.com', { [CLIENT_SOURCE_HEADER]: forged(9) }).expect(429);
    });

    it('rejects an assertion replayed against a different endpoint', async () => {
      const header = signed('198.51.100.40', '/auth/signin');
      for (let n = 0; n < 3; n++) await recover(`r${n}@example.com`, { [CLIENT_SOURCE_HEADER]: header }).expect(200);
      await recover('r9@example.com', { [CLIENT_SOURCE_HEADER]: header }).expect(429);
      await recover('other@example.com', { [CLIENT_SOURCE_HEADER]: signed('198.51.100.41', '/auth/forgot-password') }).expect(200);
    });
  });
});
