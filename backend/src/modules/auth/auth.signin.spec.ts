import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { MailService } from '../mail/mail.service.js';
import { TokenService } from './token/token.service.js';

const bcryptMocks = vi.hoisted(() => ({
  compare: vi.fn<(data: string, encrypted: string) => Promise<boolean>>(),
}));

const currentRefreshVerifier = 'refresh:sha256:v1:0eb17643d4e9261163783a420859c92c7d212fa9624106a12b510afbec266120';

vi.mock('bcrypt', () => ({
  compare: bcryptMocks.compare,
  hash: vi.fn().mockResolvedValue('hashed-refresh-token'),
}));

describe('AuthService signin', () => {
  const user = {
    id: 'user-1', email: 'amina@example.com', fullName: 'Amina Hassan',
    password: 'hashed-password', isEmailVerified: true, isActive: true,
    role: 'COMPANY_ADMIN' as const, companyId: 'company-1', refreshToken: null,
  };
  const repository = {
    findUserByEmail: vi.fn(), updateRefreshToken: vi.fn(),
    isCompanyActiveForUser: vi.fn().mockResolvedValue(true),
    findUserById: vi.fn(),
    findSessionContextById: vi.fn(),
    withRefreshTokenLock: vi.fn(),
    updatePassword: vi.fn().mockResolvedValue(undefined),
  };
  const tokens = {
    generateAccessToken: vi.fn().mockResolvedValue('access-token'),
    generateRefreshToken: vi.fn().mockResolvedValue('refresh-token'),
  };
  let service: AuthService;

  beforeEach(async () => {
    vi.clearAllMocks();
    repository.findUserByEmail.mockResolvedValue({ ...user });
    repository.isCompanyActiveForUser.mockResolvedValue(true);
    repository.findUserById.mockResolvedValue({ ...user, refreshToken: currentRefreshVerifier });
    repository.findSessionContextById.mockResolvedValue({
      ...user,
      refreshToken: currentRefreshVerifier,
      verificationToken: 'verification-secret',
      company: { id: 'company-1', name: 'Amina Logistics', suspended: false },
    });
    repository.withRefreshTokenLock.mockImplementation(async (_id, operation) =>
      operation({ ...user, refreshToken: currentRefreshVerifier }, vi.fn().mockResolvedValue(undefined), true),
    );
    bcryptMocks.compare.mockResolvedValue(true);
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: repository },
        { provide: TokenService, useValue: tokens },
        { provide: MailService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('checks the password before revealing that the account is unverified', async () => {
    repository.findUserByEmail.mockResolvedValue({ ...user, isEmailVerified: false });
    bcryptMocks.compare.mockResolvedValue(false);
    await expect(service.signin({ email: user.email, password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(bcryptMocks.compare).toHaveBeenCalledWith('wrong', user.password);
    expect(tokens.generateAccessToken).not.toHaveBeenCalled();
  });

  it('returns the existing verification response only for correct credentials', async () => {
    repository.findUserByEmail.mockResolvedValue({ ...user, isEmailVerified: false });
    await expect(service.signin({ email: user.email, password: 'correct' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(bcryptMocks.compare).toHaveBeenCalledWith('correct', user.password);
    expect(tokens.generateAccessToken).not.toHaveBeenCalled();
  });

  it('does not issue tokens to inactive accounts', async () => {
    repository.findUserByEmail.mockResolvedValue({ ...user, isActive: false });
    await expect(service.signin({ email: user.email, password: 'correct' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.generateAccessToken).not.toHaveBeenCalled();
  });

  it('rejects suspended companies with the generic credential error', async () => {
    repository.isCompanyActiveForUser.mockResolvedValue(false);
    await expect(service.signin({ email: user.email, password: 'correct' })).rejects.toMatchObject({
      status: 401,
      response: { message: 'Invalid credentials' },
    });
    expect(tokens.generateAccessToken).not.toHaveBeenCalled();
  });

  it('fails safely when a tenant account has no valid company association', async () => {
    repository.isCompanyActiveForUser.mockResolvedValue(false);
    await expect(service.signin({ email: user.email, password: 'correct' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.generateAccessToken).not.toHaveBeenCalled();
  });

  it('does not sign in a platform admin that has a tenant association', async () => {
    repository.findUserByEmail.mockResolvedValue({ ...user, role: 'PLATFORM_ADMIN' });
    repository.isCompanyActiveForUser.mockResolvedValue(false);

    await expect(service.signin({ email: user.email, password: 'correct' })).rejects.toMatchObject({
      status: 401,
      response: { message: 'Invalid credentials' },
    });
    expect(tokens.generateAccessToken).not.toHaveBeenCalled();
    expect(tokens.generateRefreshToken).not.toHaveBeenCalled();
  });

  it('does not refresh tokens for inactive accounts', async () => {
    repository.withRefreshTokenLock.mockImplementationOnce(async (_id, operation) =>
      operation({ ...user, isActive: false, refreshToken: 'hashed-refresh-token' }, vi.fn(), true),
    );
    await expect(service.refreshTokens(user.id, 'refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.generateAccessToken).not.toHaveBeenCalled();
    expect(tokens.generateRefreshToken).not.toHaveBeenCalled();
  });

  it('does not refresh tokens for unverified accounts', async () => {
    repository.withRefreshTokenLock.mockImplementationOnce(async (_id, operation) =>
      operation({ ...user, isEmailVerified: false, refreshToken: 'hashed-refresh-token' }, vi.fn(), true),
    );
    await expect(service.refreshTokens(user.id, 'refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.generateAccessToken).not.toHaveBeenCalled();
    expect(tokens.generateRefreshToken).not.toHaveBeenCalled();
  });

  it('rotates and persists the refresh token for an active account', async () => {
    const saveRefreshToken = vi.fn().mockResolvedValue(undefined);
    repository.withRefreshTokenLock.mockImplementationOnce(async (_id, operation) =>
      operation({ ...user, refreshToken: currentRefreshVerifier }, saveRefreshToken, true),
    );
    await expect(service.refreshTokens(user.id, 'refresh-token')).resolves.toMatchObject({
      accessToken: 'access-token', refreshToken: 'refresh-token',
    });
    expect(saveRefreshToken).toHaveBeenCalledWith(currentRefreshVerifier);
    expect(tokens.generateAccessToken).toHaveBeenCalledTimes(1);
  });

  it('does not rotate tokens for suspended companies', async () => {
    repository.withRefreshTokenLock.mockImplementationOnce(async (_id, operation) =>
      operation({ ...user, refreshToken: 'hashed-refresh-token' }, vi.fn(), false),
    );
    await expect(service.refreshTokens(user.id, 'refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.generateAccessToken).not.toHaveBeenCalled();
    expect(tokens.generateRefreshToken).not.toHaveBeenCalled();
  });

  it('does not rotate tokens for a platform admin with a tenant association', async () => {
    repository.withRefreshTokenLock.mockImplementationOnce(async (_id, operation) =>
      operation({ ...user, role: 'PLATFORM_ADMIN', refreshToken: 'hashed-refresh-token' }, vi.fn(), false),
    );

    await expect(service.refreshTokens(user.id, 'refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.generateAccessToken).not.toHaveBeenCalled();
    expect(tokens.generateRefreshToken).not.toHaveBeenCalled();
  });

  it('does not expose a session for an inactive or unverified account', async () => {
    repository.findSessionContextById.mockResolvedValue({
      ...user, isActive: false,
      company: { id: 'company-1', name: 'Amina Logistics', suspended: false },
    });
    await expect(service.getSessionUser(user.id)).rejects.toBeInstanceOf(UnauthorizedException);
    repository.findSessionContextById.mockResolvedValue({
      ...user, isEmailVerified: false,
      company: { id: 'company-1', name: 'Amina Logistics', suspended: false },
    });
    await expect(service.getSessionUser(user.id)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns existing session fields and the company linked to the authenticated user', async () => {
    await expect(service.getSessionUser(user.id)).resolves.toEqual({
      id: user.id,
      name: user.fullName,
      email: user.email,
      role: user.role,
      orgId: user.companyId,
      company: { id: 'company-1', name: 'Amina Logistics' },
    });
    expect(repository.findSessionContextById).toHaveBeenCalledWith(user.id);
  });

  it('returns company context for supported tenant roles', async () => {
    for (const role of ['MERCHANT', 'ACCOUNTANT'] as const) {
      repository.findSessionContextById.mockResolvedValueOnce({
        ...user,
        role,
        company: { id: 'company-1', name: 'Amina Logistics', suspended: false },
      });
      await expect(service.getSessionUser(user.id)).resolves.toMatchObject({
        role,
        orgId: 'company-1',
        company: { id: 'company-1', name: 'Amina Logistics' },
      });
    }
  });

  it('returns a null company for a company-less platform admin', async () => {
    repository.findSessionContextById.mockResolvedValueOnce({
      ...user,
      role: 'PLATFORM_ADMIN',
      companyId: null,
      company: null,
    });
    await expect(service.getSessionUser(user.id)).resolves.toMatchObject({
      role: 'PLATFORM_ADMIN', orgId: null, company: null,
    });
  });

  it('rejects a platform admin session with an unexpected tenant association', async () => {
    repository.findSessionContextById.mockResolvedValueOnce({
      ...user,
      role: 'PLATFORM_ADMIN',
      company: { id: 'company-1', name: 'Amina Logistics', suspended: false },
    });
    await expect(service.getSessionUser(user.id)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a missing user instead of returning session context', async () => {
    repository.findSessionContextById.mockResolvedValueOnce(null);
    await expect(service.getSessionUser(user.id)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a session repository result for a different authenticated subject', async () => {
    repository.findSessionContextById.mockResolvedValueOnce({
      ...user,
      id: 'other-user',
      companyId: 'other-company',
      company: { id: 'other-company', name: 'Other Logistics', suspended: false },
    });
    await expect(service.getSessionUser(user.id)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('fails closed for suspended, missing, or mismatched tenant company context', async () => {
    for (const context of [
      { ...user, company: { id: 'company-1', name: 'Amina Logistics', suspended: true } },
      { ...user, company: null },
      { ...user, company: { id: 'other-company', name: 'Other Logistics', suspended: false } },
    ]) {
      repository.findSessionContextById.mockResolvedValueOnce(context);
      await expect(service.getSessionUser(user.id)).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('does not expose database secrets in the session response', async () => {
    const session = await service.getSessionUser(user.id);
    expect(session).not.toHaveProperty('password');
    expect(session).not.toHaveProperty('refreshToken');
    expect(session).not.toHaveProperty('verificationToken');
    expect(session).not.toHaveProperty('isActive');
    expect(session).not.toHaveProperty('company.suspended');
  });

  it('does not allow inactive or unverified users to change their password', async () => {
    repository.findUserById.mockResolvedValue({ ...user, isActive: false });
    await expect(service.updatePassword(user.id, 'old-password', 'NewPassword1')).rejects.toBeInstanceOf(UnauthorizedException);
    repository.findUserById.mockResolvedValue({ ...user, isEmailVerified: false });
    await expect(service.updatePassword(user.id, 'old-password', 'NewPassword1')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(bcryptMocks.compare).not.toHaveBeenCalled();
  });

  it('returns tokens for valid active verified credentials', async () => {
    await expect(service.signin({ email: user.email, password: 'correct' })).resolves.toMatchObject({
      accessToken: 'access-token', refreshToken: 'refresh-token',
      user: { id: user.id, email: user.email },
    });
  });
});
