import { HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { createOneTimeTokenVerifier } from '../src/modules/auth/token/one-time-token.js';
import { TokenService } from '../src/modules/auth/token/token.service.js';
import { createRefreshTokenVerifier } from '../src/modules/auth/token/refresh-token-verifier.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { dateToInstant } from '../src/common/utils/temporal.js';
import { AuthPostgresTestGuard, readAuthPostgresIdentity } from './auth-postgres.safety.js';

const companyId = '11111111-1111-4111-8111-111111111111';
const otherCompanyId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const email = 'auth-integration@fleetora.test';
let priorRefreshToken: string;
const resetToken = 'a'.repeat(64);
const verificationToken = 'b'.repeat(64);

describe('authentication PostgreSQL concurrency and tenant boundaries', () => {
  const databaseGuard = new AuthPostgresTestGuard();
  let module: TestingModule;
  let prisma: PrismaService;
  let repository: AuthRepository;
  let service: AuthService;
  let tokenService: TokenService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [
        PrismaService,
        AuthRepository,
        AuthService,
        TokenService,
        {
          provide: MailService,
          useValue: {
            sendVerificationEmail: vi.fn(),
            sendResetPasswordEmail: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            ACCESS_TOKEN_SECRET: 'integration-only-access-secret',
            REFRESH_TOKEN_SECRET: 'integration-only-refresh-secret',
            SALT_ROUNDS: 4,
            FRONTEND_URL: 'http://localhost:3000',
          }),
        },
      ],
    }).compile();
    prisma = module.get(PrismaService);
    repository = module.get(AuthRepository);
    service = module.get(AuthService);
    tokenService = module.get(TokenService);

    await databaseGuard.verify(() => readAuthPostgresIdentity(prisma));
  });

  beforeEach(async () => {
    databaseGuard.assertVerified();
    await databaseGuard.verify(() => readAuthPostgresIdentity(prisma));
    vi.clearAllMocks();
    await cleanup();
    await prisma.Company.create({
      id: companyId,
      name: 'Fleetora Auth Test',
      plan: 'TRIAL',
      suspended: false,
    });
    priorRefreshToken = await tokenService.generateRefreshToken({
      sub: userId, email, role: 'COMPANY_ADMIN', orgId: companyId,
    });
    await prisma.Company.create({
      id: otherCompanyId,
      name: 'Fleetora Other Test',
      plan: 'TRIAL',
      suspended: false,
    });
    await prisma.User.create({
      id: userId,
      email,
      fullName: 'Auth Integration User',
      password: await bcrypt.hash('ExistingPassword1', 4),
      role: 'COMPANY_ADMIN',
      companyId,
      refreshToken: createRefreshTokenVerifier(priorRefreshToken),
      isActive: true,
      isEmailVerified: true,
    });
  });

  afterAll(async () => {
    await databaseGuard.teardown(async () => {
      await databaseGuard.verify(() => readAuthPostgresIdentity(prisma));
      await cleanup();
    }, async () => {
      try {
        await prisma?.db.close();
      } finally {
        await module?.close();
      }
    });
  });

  it('allows at most one concurrent rotation of the same refresh token', async () => {
    const results = await Promise.allSettled([
      service.refreshTokens(userId, priorRefreshToken),
      service.refreshTokens(userId, priorRefreshToken),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(
      service.refreshTokens(userId, priorRefreshToken),
    ).rejects.toBeDefined();
    const stored = await repository.findUserById(userId);
    expect(stored?.refreshToken).not.toBeNull();
    expect(stored?.refreshToken).toMatch(/^refresh:sha256:v1:[a-f0-9]{64}$/);
    const winner = results.find(result => result.status === 'fulfilled');
    if (!winner || winner.status !== 'fulfilled') throw new Error('Expected one successful rotation');
    await expect(service.refreshTokens(userId, winner.value.refreshToken)).resolves.toBeDefined();
  });

  it('does not reactivate a disabled user when verifying email under a suspended company', async () => {
    await prisma.Company.where({ id: companyId }).update({ suspended: true });
    await prisma.User.where({ id: userId }).update({
      isActive: false, isEmailVerified: false,
      verificationToken: createOneTimeTokenVerifier(verificationToken, 'email-verification'),
      verificationTokenExpiresAt: dateToInstant(new Date(Date.now() + 60_000)),
    });
    await expect(service.verifyEmail(userId, verificationToken)).resolves.toMatchObject({ message: expect.stringContaining('verified successfully') });
    const stored = await repository.findUserById(userId);
    expect(stored?.isActive).toBe(false);
    expect(stored?.isEmailVerified).toBe(true);
    await expect(service.signin({ email, password: 'ExistingPassword1' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout followed by signin never makes an old real JWT refreshable', async () => {
    await service.logout(userId);
    await expect(service.refreshTokens(userId, priorRefreshToken)).rejects.toBeDefined();
    const next = await service.signin({ email, password: 'ExistingPassword1' });
    expect(next.refreshToken).not.toBe(priorRefreshToken);
    await expect(service.refreshTokens(userId, priorRefreshToken)).rejects.toBeDefined();
    await expect(service.refreshTokens(userId, next.refreshToken)).resolves.toBeDefined();
  });

  it('rejects a legacy bcrypt verifier in PostgreSQL until a new signin replaces it', async () => {
    await repository.updateRefreshToken(userId, await bcrypt.hash(priorRefreshToken, 4));
    await expect(service.refreshTokens(userId, priorRefreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    const next = await service.signin({ email, password: 'ExistingPassword1' });
    expect((await repository.findUserById(userId))?.refreshToken).toMatch(/^refresh:sha256:v1:/);
    await expect(service.refreshTokens(userId, priorRefreshToken)).rejects.toBeDefined();
    await expect(service.refreshTokens(userId, next.refreshToken)).resolves.toBeDefined();
  });

  it('keeps the approved legacy long-password signin compatibility explicit', async () => {
    const prefix = 'a'.repeat(72);
    await prisma.User.where({ id: userId }).update({ password: await bcrypt.hash(prefix + 'old-suffix', 4) });
    await expect(service.signin({ email, password: prefix + 'old-suffix' })).resolves.toBeDefined();
    // Known deferred compatibility risk: bcrypt ignores the suffix for legacy credentials.
    await expect(service.signin({ email, password: prefix + 'different-suffix' })).resolves.toBeDefined();
  });

  it('logout wins after a delayed refresh transaction releases its user row', async () => {
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const original = tokenService.generateRefreshToken.bind(tokenService);
    const delayed = vi.spyOn(tokenService, 'generateRefreshToken').mockImplementation(async payload => {
      entered(); await barrier; return original(payload);
    });
    try {
      const refreshing = service.refreshTokens(userId, priorRefreshToken);
      await started;
      const loggingOut = service.logout(userId);
      release();
      const [rotated] = await Promise.all([refreshing, loggingOut]);
      expect((await repository.findUserById(userId))?.refreshToken).toBeNull();
      await expect(service.refreshTokens(userId, rotated.refreshToken)).rejects.toBeDefined();
    } finally { release(); delayed.mockRestore(); }
  });

  it('consumes a reset token once and revokes the refresh session atomically', async () => {
    await repository.saveVerificationTokenVerifier(
      userId,
      createOneTimeTokenVerifier(resetToken, 'password-reset'),
      new Date(Date.now() + 60_000),
    );
    const results = await Promise.allSettled([
      service.resetPassword(userId, resetToken, 'NewPassword1'),
      service.resetPassword(userId, resetToken, 'NewPassword1'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const stored = await repository.findUserById(userId);
    expect(stored?.verificationToken).toBeNull();
    expect(stored?.refreshToken).toBeNull();
    expect(await bcrypt.compare('NewPassword1', stored!.password)).toBe(true);
  });

  it('serializes concurrent email verification without double consumption', async () => {
    await prisma.User.where({ id: userId }).update({
      isEmailVerified: false,
      verificationToken: createOneTimeTokenVerifier(
        verificationToken,
        'email-verification',
      ),
      verificationTokenExpiresAt: dateToInstant(new Date(Date.now() + 60_000)),
    });

    const results = await Promise.all([
      service.verifyEmail(userId, verificationToken),
      service.verifyEmail(userId, verificationToken),
    ]);
    expect(results.map((result) => result.message).sort()).toEqual([
      'Email is already verified. You can sign in.',
      'Email verified successfully. You can now sign in.',
    ]);
    const stored = await repository.findUserById(userId);
    expect(stored?.isEmailVerified).toBe(true);
    expect(stored?.verificationToken).toBeNull();
  });

  it('keeps reset and verification token purposes isolated', async () => {
    await prisma.User.where({ id: userId }).update({ isEmailVerified: false });
    await repository.saveVerificationTokenVerifier(
      userId,
      createOneTimeTokenVerifier(resetToken, 'password-reset'),
      new Date(Date.now() + 60_000),
    );
    await expect(service.verifyEmail(userId, resetToken)).rejects.toBeDefined();

    await repository.saveVerificationTokenVerifier(
      userId,
      createOneTimeTokenVerifier(verificationToken, 'email-verification'),
      new Date(Date.now() + 60_000),
    );
    await expect(
      service.resetPassword(userId, verificationToken, 'NewPassword1'),
    ).rejects.toBeDefined();

    await repository.saveVerificationTokenVerifier(
      userId,
      createOneTimeTokenVerifier(resetToken, 'password-reset'),
      new Date(Date.now() - 1),
    );
    await expect(
      service.resetPassword(userId, resetToken, 'NewPassword1'),
    ).rejects.toBeDefined();
    await expect(
      service.resetPassword(userId, 'malformed', 'NewPassword1'),
    ).rejects.toBeDefined();
  });

  it('does not change verification state or account fields for invalid and expired codes', async () => {
    await prisma.User.where({ id: userId }).update({ isEmailVerified: false });
    await repository.saveVerificationTokenVerifier(userId, createOneTimeTokenVerifier(verificationToken, 'email-verification'), new Date(Date.now() + 60_000));
    const before = await repository.findUserById(userId);
    await expect(service.verifyEmail(userId, 'c'.repeat(64))).rejects.toBeDefined();
    expect(await repository.findUserById(userId)).toEqual(before);
    await repository.saveVerificationTokenVerifier(userId, createOneTimeTokenVerifier(verificationToken, 'email-verification'), new Date(Date.now() - 1));
    const expired = await repository.findUserById(userId);
    await expect(service.verifyEmail(userId, verificationToken)).rejects.toBeDefined();
    expect(await repository.findUserById(userId)).toEqual(expired);
  });

  it('fails closed for suspended or missing tenants and omits tenant identity for a platform admin', async () => {
    await expect(service.getSessionUser(userId)).resolves.toMatchObject({
      orgId: companyId,
    });
    await prisma.Company.where({ id: companyId }).update({ suspended: true });
    await expect(service.getSessionUser(userId)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    await prisma.Company.where({ id: companyId }).update({ suspended: false });
    await prisma.User.where({ id: userId }).update({ companyId: null });
    await expect(service.getSessionUser(userId)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    await prisma.User.where({ id: userId }).update({ role: 'PLATFORM_ADMIN' });
    await expect(service.getSessionUser(userId)).resolves.toMatchObject({
      role: 'PLATFORM_ADMIN',
      orgId: null,
      company: null,
    });
  });

  it('rolls back refresh state when a locked transaction operation fails', async () => {
    const before = await repository.findUserById(userId);
    await expect(
      repository.withRefreshTokenLock(userId, async (_user, save) => {
        await save('must-be-rolled-back');
        throw new Error('simulated transaction failure');
      }),
    ).rejects.toThrow('simulated transaction failure');
    const after = await repository.findUserById(userId);
    expect(after?.refreshToken).toBe(before?.refreshToken);
  });

  async function companyCount(): Promise<number> {
    const query = prisma.db.raw.sql`SELECT count(*)::int AS "total" FROM "companies"`
      .returnsRow({ total: 'pg/int4@1' }).build();
    const [row] = await prisma.db.runtime().query(query);
    if (!row) throw new Error('Missing company count');
    return row.total;
  }

  it('rolls back company creation when the user write is rejected by PostgreSQL', async () => {
    const before = await companyCount();
    // PostgreSQL text rejects NUL; inject failure at the user write, after company creation.
    await expect(repository.createUserWithDefaultCompany('Phase6B Rollback', 'phase6b-rollback@fleetora.test', '\0')).rejects.toBeDefined();
    expect(await companyCount()).toBe(before);
    expect(await repository.findUserByEmail('phase6b-rollback@fleetora.test')).toBeNull();
  });

  it('creates one company/user for concurrent duplicate signup', async () => {
    const before = await companyCount();
    const results = await Promise.allSettled([
      repository.createUserWithDefaultCompany('Phase6B Duplicate', 'phase6b-duplicate@fleetora.test', 'fixture-hash'),
      repository.createUserWithDefaultCompany('Phase6B Duplicate', 'phase6b-duplicate@fleetora.test', 'fixture-hash'),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await companyCount()).toBe(before + 1);
    const account = await repository.findUserByEmail('phase6b-duplicate@fleetora.test');
    expect(account).toMatchObject({ role: 'COMPANY_ADMIN', isActive: true, isEmailVerified: false });
    expect(account?.companyId).toBeTruthy();
  });

  it('does not add a company for an already registered email', async () => {
    const before = await companyCount();
    await expect(repository.createUserWithDefaultCompany('Phase6B Existing', email, 'fixture-hash')).rejects.toBeDefined();
    expect(await companyCount()).toBe(before);
  });

  it('retains committed signup data if external email fails under the existing contract', async () => {
    const before = await companyCount();
    const delivery = module.get(MailService).sendVerificationEmail as ReturnType<typeof vi.fn>;
    delivery.mockRejectedValueOnce(new Error('test-only delivery failure'));
    await expect(service.signup({ name: 'Phase6B Mail Failure', email: 'phase6b-mail-failure@fleetora.test', password: 'NewPassword1' })).rejects.toThrow('test-only delivery failure');
    expect(await companyCount()).toBe(before + 1);
    expect(await repository.findUserByEmail('phase6b-mail-failure@fleetora.test')).toMatchObject({ isEmailVerified: false, verificationToken: expect.stringMatching(/^email-verification:sha256:/) });
  });

  it('permits one verification resend when concurrent requests share a cooldown window', async () => {
    await prisma.User.where({ id: userId }).update({ isEmailVerified: false, verificationToken: null, verificationTokenExpiresAt: null });
    const mail = module.get(MailService);
    const results = await Promise.allSettled([service.resendVerificationCode(userId), service.resendVerificationCode(userId)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const denied = results.find(result => result.status === 'rejected');
    if (!denied || denied.status !== 'rejected') throw new Error('Expected one cooldown rejection');
    if (!(denied.reason instanceof HttpException)) throw new Error('Expected HTTP cooldown rejection');
    expect(denied.reason.getStatus()).toBe(429);
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  async function cleanup(): Promise<void> {
    databaseGuard.assertVerified();
    for (const name of ['Phase6B Rollback', 'Phase6B Duplicate', 'Phase6B Existing', 'Phase6B Mail Failure']) {
      await prisma?.Company.where({ name: `${name}'s Company` }).delete();
    }
    await prisma?.User.where({ id: userId }).delete();
    await prisma?.Company.where({ id: companyId }).delete();
    await prisma?.Company.where({ id: otherCompanyId }).delete();
  }
});
