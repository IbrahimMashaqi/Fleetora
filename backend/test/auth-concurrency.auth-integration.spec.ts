import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { createOneTimeTokenVerifier } from '../src/modules/auth/token/one-time-token.js';
import { TokenService } from '../src/modules/auth/token/token.service.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { dateToInstant } from '../src/common/utils/temporal.js';

const companyId = '11111111-1111-4111-8111-111111111111';
const otherCompanyId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const email = 'auth-integration@fleetora.test';
const priorRefreshToken = 'prior-refresh-token';
const resetToken = 'a'.repeat(64);
const verificationToken = 'b'.repeat(64);

describe('authentication PostgreSQL concurrency and tenant boundaries', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let repository: AuthRepository;
  let service: AuthService;
  const tokenService = {
    generateAccessToken: vi.fn().mockResolvedValue('new-access-token'),
    generateRefreshToken: vi.fn().mockResolvedValue('new-refresh-token'),
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        PrismaService,
        AuthRepository,
        AuthService,
        { provide: TokenService, useValue: tokenService },
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
            SALT_ROUNDS: 4,
            FRONTEND_URL: 'http://localhost:3000',
          }),
        },
      ],
    }).compile();
    prisma = module.get(PrismaService);
    repository = module.get(AuthRepository);
    service = module.get(AuthService);

    const identityPlan = prisma.db.raw.sql`SELECT current_database() AS "databaseName"`
      .returnsRow({ databaseName: 'pg/text@1' })
      .build();
    const [identity] = await prisma.db.runtime().query(identityPlan);
    expect(identity?.databaseName).toBe(
      process.env.FLEETORA_VERIFIED_TEST_DATABASE_NAME,
    );
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
    await prisma.Company.create({
      id: companyId,
      name: 'Fleetora Auth Test',
      plan: 'TRIAL',
      suspended: false,
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
      refreshToken: await bcrypt.hash(priorRefreshToken, 4),
      isActive: true,
      isEmailVerified: true,
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.db.close();
    await module.close();
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
    expect(await bcrypt.compare('new-refresh-token', stored!.refreshToken!)).toBe(true);
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

  async function cleanup(): Promise<void> {
    await prisma?.User.where({ id: userId }).delete();
    await prisma?.Company.where({ id: companyId }).delete();
    await prisma?.Company.where({ id: otherCompanyId }).delete();
  }
});
