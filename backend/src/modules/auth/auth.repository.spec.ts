import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRepository } from './auth.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('AuthRepository company authentication status', () => {
  const first = vi.fn();
  const sessionFirst = vi.fn();
  const companySelect = vi.fn().mockReturnValue({});
  const include = vi.fn().mockImplementation((_relation, selectRelated) => {
    selectRelated({ select: companySelect });
    return { first: sessionFirst };
  });
  const select = vi.fn().mockReturnValue({ include });
  const updateUser = vi.fn().mockResolvedValue(undefined);
  const userWhere = vi.fn().mockReturnValue({ select, update: updateUser });
  const lockedUserFirst = vi.fn();
  const lockedUserUpdate = vi.fn().mockResolvedValue(undefined);
  const lockedUserWhere = vi.fn(() => ({ first: lockedUserFirst, update: lockedUserUpdate }));
  const lockedCompanyFirst = vi.fn();
  const lockedCompanyWhere = vi.fn(() => ({ first: lockedCompanyFirst }));
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    orm: { public: { User: { where: lockedUserWhere }, Company: { where: lockedCompanyWhere } } },
  };
  const transaction = vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx));
  const sql = vi.fn(() => ({ affectedCount: () => ({ build: () => ({}) }) }));
  const prisma = {
    db: { transaction, raw: { sql } },
    Company: {
      where: vi.fn(() => ({ first })),
    },
    User: { where: userWhere },
  };
  let repository: AuthRepository;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    repository = module.get(AuthRepository);
  });

  it('allows an active company member', async () => {
    first.mockResolvedValue({ id: 'company-1', suspended: false });

    await expect(
      repository.isCompanyActiveForUser({ role: 'COMPANY_ADMIN', companyId: 'company-1' }),
    ).resolves.toBe(true);
  });

  it('rejects members of a suspended company', async () => {
    first.mockResolvedValue({ id: 'company-1', suspended: true });

    await expect(
      repository.isCompanyActiveForUser({ role: 'COMPANY_ADMIN', companyId: 'company-1' }),
    ).resolves.toBe(false);
  });

  it('rejects a missing company and tenant users without an association', async () => {
    first.mockResolvedValue(null);
    await expect(
      repository.isCompanyActiveForUser({ role: 'MERCHANT', companyId: 'missing-company' }),
    ).resolves.toBe(false);
    await expect(
      repository.isCompanyActiveForUser({ role: 'MERCHANT', companyId: null }),
    ).resolves.toBe(false);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('allows a platform admin without a company association', async () => {
    await expect(
      repository.isCompanyActiveForUser({ role: 'PLATFORM_ADMIN', companyId: null }),
    ).resolves.toBe(true);
    expect(prisma.Company.where).not.toHaveBeenCalled();
  });

  it('rejects a platform admin that is associated with a company', async () => {
    first.mockResolvedValue({ id: 'company-1', suspended: false });

    await expect(
      repository.isCompanyActiveForUser({ role: 'PLATFORM_ADMIN', companyId: 'company-1' }),
    ).resolves.toBe(false);
    expect(prisma.Company.where).not.toHaveBeenCalled();
  });

  it('rejects refresh rotation for a platform admin with a company association', async () => {
    lockedUserFirst.mockResolvedValue({
      id: 'admin-1',
      role: 'PLATFORM_ADMIN',
      companyId: 'company-1',
    });
    lockedCompanyFirst.mockResolvedValue({ id: 'company-1', suspended: false });

    await expect(
      repository.withRefreshTokenLock('admin-1', async (_user, _saveRefreshToken, companyIsActive) => companyIsActive),
    ).resolves.toBe(false);
    expect(lockedCompanyWhere).not.toHaveBeenCalled();
  });

  it('consumes an email verifier once and clears it atomically with verification', async () => {
    const now = new Date();
    const account = {
      id: 'user-1',
      isEmailVerified: false,
      verificationToken: 'email-verification:sha256:ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
      verificationTokenExpiresAt: new Date(now.getTime() + 60_000),
    };
    lockedUserFirst.mockImplementation(async () => account);
    lockedUserUpdate.mockImplementation(async (changes: Record<string, unknown>) => {
      Object.assign(account, changes);
      return undefined;
    });

    await expect(
      repository.consumeEmailVerificationToken(
        'user-1',
        account.verificationToken,
        now,
      ),
    ).resolves.toBe('verified');
    await expect(
      repository.consumeEmailVerificationToken(
        'user-1',
        account.verificationToken,
        now,
      ),
    ).resolves.toBe('already-verified');

    expect(lockedUserUpdate).toHaveBeenCalledTimes(1);
    expect(lockedUserUpdate).toHaveBeenCalledWith({
      isEmailVerified: true,
      isActive: true,
      verificationToken: null,
      verificationTokenExpiresAt: null,
    });
  });

  it('rejects legacy raw tokens and expired verification verifiers without account changes', async () => {
    const rawLegacyToken = 'a'.repeat(64);
    const account = {
      id: 'user-1',
      isEmailVerified: false,
      verificationToken: rawLegacyToken,
      verificationTokenExpiresAt: new Date(Date.now() + 60_000),
    };
    lockedUserFirst.mockResolvedValue(account);
    await expect(
      repository.consumeEmailVerificationToken(
        'user-1',
        'email-verification:sha256:ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
        new Date(),
      ),
    ).resolves.toBe('invalid');
    expect(lockedUserUpdate).not.toHaveBeenCalled();

    account.verificationToken = 'email-verification:sha256:ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb';
    account.verificationTokenExpiresAt = new Date(Date.now() - 1);
    await expect(
      repository.consumeEmailVerificationToken(
        'user-1',
        account.verificationToken,
        new Date(),
      ),
    ).resolves.toBe('expired');
    expect(lockedUserUpdate).not.toHaveBeenCalled();
  });

  it('consumes a password-reset verifier while clearing the refresh session in the same row update', async () => {
    const now = new Date();
    const candidateVerifier = 'password-reset:sha256:ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb';
    const account = {
      id: 'user-1',
      verificationToken: candidateVerifier,
      verificationTokenExpiresAt: new Date(now.getTime() + 60_000),
    };
    lockedUserFirst.mockImplementation(async () => account);
    lockedUserUpdate.mockImplementation(async (changes: Record<string, unknown>) => {
      Object.assign(account, changes);
      return undefined;
    });

    await expect(
      repository.consumePasswordResetToken(
        'user-1',
        candidateVerifier,
        now,
        'new-password-hash',
      ),
    ).resolves.toBe(true);
    await expect(
      repository.consumePasswordResetToken(
        'user-1',
        candidateVerifier,
        now,
        'replayed-password-hash',
      ),
    ).resolves.toBe(false);

    expect(lockedUserUpdate).toHaveBeenCalledTimes(1);
    expect(lockedUserUpdate).toHaveBeenCalledWith({
      password: 'new-password-hash',
      refreshToken: null,
      verificationToken: null,
      verificationTokenExpiresAt: null,
    });
  });

  it('does not let an email-verification verifier reset the password', async () => {
    const now = new Date();
    const account = {
      id: 'user-1',
      verificationToken: 'email-verification:sha256:ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
      verificationTokenExpiresAt: new Date(now.getTime() + 60_000),
    };
    lockedUserFirst.mockResolvedValue(account);

    await expect(
      repository.consumePasswordResetToken(
        'user-1',
        account.verificationToken,
        now,
        'new-password-hash',
      ),
    ).resolves.toBe(false);
    expect(lockedUserUpdate).not.toHaveBeenCalled();
  });

  it('rejects an expired password-reset verifier without changing credentials or session state', async () => {
    const now = new Date();
    const candidateVerifier = 'password-reset:sha256:ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb';
    lockedUserFirst.mockResolvedValue({
      id: 'user-1',
      verificationToken: candidateVerifier,
      verificationTokenExpiresAt: new Date(now.getTime() - 1),
    });

    await expect(
      repository.consumePasswordResetToken(
        'user-1',
        candidateVerifier,
        now,
        'new-password-hash',
      ),
    ).resolves.toBe(false);
    expect(lockedUserUpdate).not.toHaveBeenCalled();
  });

  it('loads only session fields and the company related to the authenticated user', async () => {
    sessionFirst.mockResolvedValue({
      id: 'user-1',
      fullName: 'Amina Hassan',
      email: 'amina@example.com',
      role: 'COMPANY_ADMIN',
      companyId: 'company-1',
      isActive: true,
      isEmailVerified: true,
      company: { id: 'company-1', name: 'Amina Logistics', suspended: false },
    });

    await repository.findSessionContextById('user-1');

    expect(userWhere).toHaveBeenCalledWith({ id: 'user-1' });
    expect(select).toHaveBeenCalledWith(
      'id', 'fullName', 'email', 'role', 'companyId', 'isActive', 'isEmailVerified',
    );
    expect(include).toHaveBeenCalledWith('company', expect.any(Function));
    expect(companySelect).toHaveBeenCalledWith('id', 'name', 'suspended');
    expect(sessionFirst).toHaveBeenCalledTimes(1);
  });
});
