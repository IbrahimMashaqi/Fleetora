import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Temporal } from 'temporal-polyfill';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AccessTokenStrategy } from '../auth/strategies/access-token.strategy.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor.js';
import { HttpExceptionFilter } from '../../common/exceptions-filter/http-exception.filter.js';
import type { UserRole } from '../auth/token/token.payload.js';
import { StaffModule } from './staff.module.js';
import { StaffRepository } from './staff.repository.js';
import { hashStaffToken } from './staff.service.js';

const companyA = '11111111-1111-4111-8111-111111111111';
const invitationId = '33333333-3333-4333-8333-333333333333';
const token = 'b'.repeat(64);
const future = Temporal.Now.instant().add({ hours: 24 });
const past = Temporal.Instant.from('2026-01-01T00:00:00Z');
const invitationRow = (overrides: Record<string, unknown> = {}) => ({
  id: invitationId,
  email: 'accountant@example.invalid',
  role: 'ACCOUNTANT',
  expiresAt: future,
  createdAt: past,
  acceptedAt: null,
  revokedAt: null,
  ...overrides,
});

// Real Nest HTTP pipeline, JWT validation, persisted-identity strategy, DTOs and
// service. Persistence is an in-memory fixture; database behaviour is covered by
// test/staff.auth-integration.spec.ts.
describe('Company staff invitations API (isolated fixtures)', () => {
  let app: INestApplication<App>;
  let actor: {
    id: string;
    email: string;
    role: UserRole;
    companyId: string | null;
    isActive: boolean;
    isEmailVerified: boolean;
  };
  const findUserById = vi.fn();
  const isCompanyActiveForUser = vi.fn();
  const members = vi.fn();
  const invitations = vi.fn();
  const findOne = vi.fn();
  const findByTokenHash = vi.fn();
  const issue = vi.fn();
  const revoke = vi.fn();
  const accept = vi.fn();
  const secret = 'isolated-staff-api-test-secret';
  const jwt = new JwtService({ secret });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [StaffModule],
      providers: [
        AccessTokenStrategy,
        {
          provide: ConfigService,
          useValue: new ConfigService({ ACCESS_TOKEN_SECRET: secret }),
        },
        {
          provide: AuthRepository,
          useValue: { findUserById, isCompanyActiveForUser },
        },
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({ ACCESS_TOKEN_SECRET: secret, SALT_ROUNDS: 4 }),
      )
      .overrideProvider(StaffRepository)
      .useValue({
        members,
        invitations,
        findOne,
        findByTokenHash,
        issue,
        revoke,
        accept,
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    actor = {
      id: '77777777-7777-4777-8777-777777777777',
      email: 'admin@example.invalid',
      role: 'COMPANY_ADMIN',
      companyId: companyA,
      isActive: true,
      isEmailVerified: true,
    };
    findUserById.mockImplementation(async (id: string) =>
      id === actor.id ? actor : null,
    );
    isCompanyActiveForUser.mockResolvedValue(true);
    members.mockResolvedValue([
      {
        id: actor.id,
        fullName: 'Fixture Admin',
        email: actor.email,
        role: 'COMPANY_ADMIN',
        isActive: true,
        password: 'private-hash',
      },
    ]);
    invitations.mockResolvedValue([invitationRow({ tokenHash: 'private' })]);
    findOne.mockResolvedValue(invitationRow());
    issue.mockResolvedValue({ companyId: companyA, id: invitationId });
    revoke.mockResolvedValue(true);
    findByTokenHash.mockResolvedValue({ id: invitationId, companyId: companyA });
    accept.mockResolvedValue({
      companyId: companyA,
      role: 'ACCOUNTANT',
      email: 'accountant@example.invalid',
    });
  });
  afterAll(async () => {
    await app?.close();
  });

  function bearer() {
    return jwt.sign(
      {
        sub: actor.id,
        email: actor.email,
        role: actor.role,
        orgId: actor.companyId ?? '',
        typ: 'access',
      },
      { expiresIn: '5m' },
    );
  }
  const server = () => request(app.getHttpServer());
  function issueRequest(
    body: Record<string, unknown>,
    context: string | null = companyA,
  ) {
    const call = server()
      .post('/company/staff/invitations')
      .set('Authorization', `Bearer ${bearer()}`);
    if (context) call.set('X-Fleetora-Company-Context', context);
    return call.send(body);
  }
  const acceptBody = {
    token,
    name: 'Fixture Accountant',
    password: 'Secret12',
  };

  it('lists own staff and invitations with only public fields', async () => {
    const response = await server()
      .get('/company/staff')
      .set('Authorization', `Bearer ${bearer()}`)
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.data).toEqual({
      companyId: companyA,
      members: [
        {
          id: actor.id,
          fullName: 'Fixture Admin',
          email: actor.email,
          role: 'COMPANY_ADMIN',
          active: true,
        },
      ],
      invitations: [
        {
          id: invitationId,
          email: 'accountant@example.invalid',
          role: 'ACCOUNTANT',
          state: 'PENDING',
          expiresAt: future.toString(),
          createdAt: past.toString(),
          acceptedAt: null,
          revokedAt: null,
        },
      ],
    });
    expect(JSON.stringify(response.body)).not.toMatch(/private/);
    expect(members).toHaveBeenCalledWith(companyA);
    expect(invitations).toHaveBeenCalledWith(companyA);
  });

  it('reports expired invitations as EXPIRED', async () => {
    invitations.mockResolvedValue([invitationRow({ expiresAt: past })]);
    const response = await server()
      .get('/company/staff')
      .set('Authorization', `Bearer ${bearer()}`)
      .expect(200);
    expect(response.body.data.invitations[0].state).toBe('EXPIRED');
  });

  for (const role of ['ACCOUNTANT', 'MERCHANT'] as const)
    it(`denies ${role} staff administration`, async () => {
      actor.role = role;
      await server()
        .get('/company/staff')
        .set('Authorization', `Bearer ${bearer()}`)
        .expect(403);
      await issueRequest({ email: 'x@example.invalid', role: 'ACCOUNTANT' }).expect(
        403,
      );
      expect(members).not.toHaveBeenCalled();
      expect(issue).not.toHaveBeenCalled();
    });

  it('rejects unauthenticated administration', async () => {
    await server().get('/company/staff').expect(401);
    await server()
      .post('/company/staff/invitations')
      .send({ email: 'x@example.invalid', role: 'ACCOUNTANT' })
      .expect(401);
    expect(issue).not.toHaveBeenCalled();
  });

  it('issues an invitation, stores only the token hash and returns the token once', async () => {
    const response = await issueRequest({
      email: ' Accountant@Example.INVALID ',
      role: 'ACCOUNTANT',
      companyId: '22222222-2222-4222-8222-222222222222',
    }).expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const data = response.body.data;
    expect(data).toMatchObject({
      companyId: companyA,
      delivery: 'MANUAL',
      invitation: { id: invitationId, state: 'PENDING', role: 'ACCOUNTANT' },
    });
    expect(data.token).toMatch(/^[a-f0-9]{64}$/);
    const [issuedActor, stored] = issue.mock.calls[0];
    expect(issuedActor).toMatchObject({ sub: actor.id, orgId: companyA });
    expect(stored).toMatchObject({
      email: 'accountant@example.invalid',
      role: 'ACCOUNTANT',
      tokenHash: hashStaffToken(data.token),
    });
    expect(JSON.stringify(stored)).not.toContain(data.token);
    expect(JSON.stringify(stored)).not.toContain('2222');
  });

  it('allows inviting a second company administrator', async () => {
    await issueRequest({
      email: 'second@example.invalid',
      role: 'COMPANY_ADMIN',
    }).expect(201);
    expect(issue.mock.calls[0][1]).toMatchObject({ role: 'COMPANY_ADMIN' });
  });

  for (const role of ['PLATFORM_ADMIN', 'MERCHANT', 'DRIVER', ''])
    it(`refuses to invite role "${role}"`, async () => {
      await issueRequest({ email: 'x@example.invalid', role }).expect(400);
      expect(issue).not.toHaveBeenCalled();
    });

  it('rejects an out-of-range expiry and a malformed email', async () => {
    await issueRequest({
      email: 'x@example.invalid',
      role: 'ACCOUNTANT',
      expiresInHours: 500,
    }).expect(400);
    await issueRequest({ email: 'not-an-email', role: 'ACCOUNTANT' }).expect(400);
    expect(issue).not.toHaveBeenCalled();
  });

  it('fences a missing or different company context on writes', async () => {
    const body = { email: 'x@example.invalid', role: 'ACCOUNTANT' };
    await issueRequest(body, null).expect(403);
    await issueRequest(body, '22222222-2222-4222-8222-222222222222').expect(403);
    await server()
      .delete(`/company/staff/invitations/${invitationId}`)
      .set('Authorization', `Bearer ${bearer()}`)
      .expect(403);
    expect(issue).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it('surfaces an email already in use as a conflict', async () => {
    issue.mockRejectedValue(
      new ConflictException('An account already uses this email'),
    );
    await issueRequest({ email: 'x@example.invalid', role: 'ACCOUNTANT' }).expect(
      409,
    );
  });

  it('revokes in the actor company and hides foreign invitations as 404', async () => {
    const call = () =>
      server()
        .delete(`/company/staff/invitations/${invitationId}`)
        .set('Authorization', `Bearer ${bearer()}`)
        .set('X-Fleetora-Company-Context', companyA);
    const response = await call().expect(200);
    expect(response.body.data).toEqual({ companyId: companyA, revoked: true });
    expect(revoke).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: companyA }),
      invitationId,
    );
    revoke.mockResolvedValue(false);
    await call().expect(404);
    await server()
      .delete('/company/staff/invitations/not-a-uuid')
      .set('Authorization', `Bearer ${bearer()}`)
      .set('X-Fleetora-Company-Context', companyA)
      .expect(400);
  });

  it('accepts publicly with a valid token and never returns secrets', async () => {
    const response = await server()
      .post('/company/staff/invitations/accept')
      .send({ ...acceptBody, role: 'COMPANY_ADMIN', companyId: 'forged' })
      .expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toEqual({
      accepted: true,
      email: 'accountant@example.invalid',
      role: 'ACCOUNTANT',
    });
    expect(findByTokenHash).toHaveBeenCalledWith(hashStaffToken(token));
    const [id, companyId, hash, account] = accept.mock.calls[0];
    expect([id, companyId, hash]).toEqual([
      invitationId,
      companyA,
      hashStaffToken(token),
    ]);
    expect(account.fullName).toBe('Fixture Accountant');
    expect(account.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(JSON.stringify(response.body)).not.toMatch(/Secret12|\$2[aby]\$/);
  });

  it('rejects unknown, used or malformed tokens and weak passwords', async () => {
    findByTokenHash.mockResolvedValueOnce(null);
    await server()
      .post('/company/staff/invitations/accept')
      .send(acceptBody)
      .expect(400);
    accept.mockResolvedValueOnce(null);
    await server()
      .post('/company/staff/invitations/accept')
      .send({ ...acceptBody, token: 'c'.repeat(64) })
      .expect(400);
    await server()
      .post('/company/staff/invitations/accept')
      .send({ ...acceptBody, token: 'short' })
      .expect(400);
    await server()
      .post('/company/staff/invitations/accept')
      .send({ ...acceptBody, token: 'd'.repeat(64), password: 'lowercase1' })
      .expect(400);
    await server()
      .post('/company/staff/invitations/accept')
      .send({ ...acceptBody, token: 'e'.repeat(64), name: ' ' })
      .expect(400);
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it('rate limits repeated attempts on one token', async () => {
    findByTokenHash.mockResolvedValue(null);
    const limited = 'f'.repeat(64);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1)
      statuses.push(
        (
          await server()
            .post('/company/staff/invitations/accept')
            .send({ ...acceptBody, token: limited })
        ).status,
      );
    expect(statuses).toContain(429);
  });
});
