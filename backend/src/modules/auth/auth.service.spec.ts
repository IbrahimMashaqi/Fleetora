import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { MailService } from '../mail/mail.service.js';
import { TokenService } from './token/token.service.js';
import { createOneTimeTokenVerifier } from './token/one-time-token.js';
import * as bcrypt from 'bcrypt';

const verificationToken = 'a'.repeat(64);
const expectedTokenDigest =
  'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb';
const verificationTokenVerifier = `email-verification:sha256:${expectedTokenDigest}`;
const resetTokenVerifier = `password-reset:sha256:${expectedTokenDigest}`;
const genericRecoveryResponse = {
  message: 'If an account exists for this email, password reset instructions will be sent.',
};

describe('AuthService email verification', () => {
  let module: TestingModule;
  let authService: AuthService;
  let authRepository: {
    findUserByEmail: ReturnType<typeof vi.fn>;
    findUserById: ReturnType<typeof vi.fn>;
    isCompanyActiveForUser: ReturnType<typeof vi.fn>;
    saveVerificationTokenVerifier: ReturnType<typeof vi.fn>;
    consumeEmailVerificationToken: ReturnType<typeof vi.fn>;
    consumePasswordResetToken: ReturnType<typeof vi.fn>;
    reserveEmailVerificationToken: ReturnType<typeof vi.fn>;
  };
  let mailService: {
    sendVerificationEmail: ReturnType<typeof vi.fn>;
    sendResetPasswordEmail: ReturnType<typeof vi.fn>;
  };
  let user: {
    id: string;
    email: string;
    fullName: string;
    isEmailVerified: boolean;
    verificationToken: string | null;
    verificationTokenExpiresAt: Date | null;
  };

  beforeEach(async () => {
    user = {
      id: 'user-1',
      email: 'amina@example.com',
      fullName: 'Amina Hassan',
      isEmailVerified: false,
      verificationToken: resetTokenVerifier,
      verificationTokenExpiresAt: new Date(Date.now() + 60_000),
    };
    authRepository = {
      findUserByEmail: vi.fn().mockResolvedValue({
        id: 'user-1', email: 'amina@example.com', fullName: 'Amina Hassan',
      }),
      findUserById: vi.fn().mockResolvedValue(user),
      isCompanyActiveForUser: vi.fn().mockResolvedValue(true),
      saveVerificationTokenVerifier: vi.fn().mockImplementation(
        async (_userId: string, verifier: string, expiresAt: Date) => {
          user.verificationToken = verifier;
          user.verificationTokenExpiresAt = expiresAt;
        },
      ),
      consumeEmailVerificationToken: vi.fn().mockResolvedValue('verified'),
      consumePasswordResetToken: vi.fn().mockResolvedValue(true),
      reserveEmailVerificationToken: vi.fn().mockImplementation(async () => ({ status: 'reserved', user })),
    };
    mailService = {
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
      sendResetPasswordEmail: vi.fn().mockResolvedValue(undefined),
    };
    module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: authRepository },
        { provide: TokenService, useValue: {} },
        { provide: MailService, useValue: mailService },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                SALT_ROUNDS: 10,
                VERIFICATION_CODE_EXPIRY_MINUTES: 15,
                FRONTEND_URL: 'https://app.fleetora.test',
              })[key],
          },
        },
      ],
    }).compile();
    authService = module.get(AuthService);
  });

  it('verifies the matching account token and updates account state', async () => {
    await expect(
      authService.verifyEmail(user.id, verificationToken),
    ).resolves.toEqual({
      message: 'Email verified successfully. You can now sign in.',
    });
    expect(authRepository.consumeEmailVerificationToken).toHaveBeenCalledWith(
      user.id,
      verificationTokenVerifier,
      expect.any(Date),
    );
  });

  it('rejects an invalid token without updating account state', async () => {
    authRepository.consumeEmailVerificationToken.mockResolvedValue('invalid');
    await expect(
      authService.verifyEmail(user.id, 'b'.repeat(64)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authRepository.consumeEmailVerificationToken).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed stored tokens', async () => {
    authRepository.consumeEmailVerificationToken.mockResolvedValue('invalid');

    await expect(
      authService.verifyEmail(user.id, verificationToken),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authRepository.consumeEmailVerificationToken).toHaveBeenCalledTimes(1);
  });

  it('rejects expired tokens', async () => {
    authRepository.consumeEmailVerificationToken.mockResolvedValue('expired');

    await expect(
      authService.verifyEmail(user.id, verificationToken),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authRepository.consumeEmailVerificationToken).toHaveBeenCalledTimes(1);
  });

  it('returns the already-verified state without consuming another token', async () => {
    user.isEmailVerified = true;
    authRepository.consumeEmailVerificationToken.mockResolvedValue('already-verified');

    await expect(
      authService.verifyEmail(user.id, verificationToken),
    ).resolves.toEqual({
      message: 'Email is already verified. You can sign in.',
    });
    expect(authRepository.consumeEmailVerificationToken).toHaveBeenCalledWith(
      user.id,
      verificationTokenVerifier,
      expect.any(Date),
    );
  });

  it('uses the configured frontend origin and expiry in the verification email', async () => {
    await authService.sendVerificationEmail(
      user,
      verificationToken,
      new Date(Date.now() + 15 * 60_000),
    );

    const [email, name, link, expiry] =
      mailService.sendVerificationEmail.mock.calls[0];
    const verificationUrl = new URL(link);
    expect(email).toBe(user.email);
    expect(name).toBe(user.fullName);
    expect(verificationUrl.origin).toBe('https://app.fleetora.test');
    expect(verificationUrl.pathname).toBe('/auth/verify-email');
    expect(verificationUrl.searchParams.get('userId')).toBe(user.id);
    expect(verificationUrl.searchParams.get('token')).toBeNull();
    expect(new URLSearchParams(verificationUrl.hash.slice(1)).get('token')).toBe(
      verificationToken,
    );
    expect(authRepository.saveVerificationTokenVerifier).toHaveBeenCalledWith(
      user.id,
      verificationTokenVerifier,
      expect.any(Date),
    );
    expect(expiry).toBe(15);
  });

  it('builds a reset link from the configured frontend URL', async () => {
    await authService.sendForgotPasswordEmail('amina@example.com');

    const [, , link] = mailService.sendResetPasswordEmail.mock.calls[0];
    const resetUrl = new URL(link);
    expect(resetUrl.origin).toBe('https://app.fleetora.test');
    expect(resetUrl.pathname).toBe('/auth/reset-password');
    expect(resetUrl.searchParams.get('userId')).toBe('user-1');
    expect(resetUrl.searchParams.get('token')).toBeNull();
    const rawResetToken = new URLSearchParams(resetUrl.hash.slice(1)).get('token');
    if (rawResetToken === null) throw new Error('Reset email link must include its token fragment');
    expect(rawResetToken).toMatch(/^[a-f0-9]{64}$/);
    expect(authRepository.saveVerificationTokenVerifier).toHaveBeenCalledWith(
      user.id,
      createOneTimeTokenVerifier(rawResetToken, 'password-reset'),
      expect.any(Date),
    );
  });

  it('invalidates the existing refresh session when a password reset succeeds', async () => {
    await expect(
      authService.resetPassword(user.id, verificationToken, 'NewPassword1'),
    ).resolves.toEqual({ message: 'Password updated successfully' });

    expect(authRepository.consumePasswordResetToken).toHaveBeenCalledWith(
      user.id,
      resetTokenVerifier,
      expect.any(Date),
      expect.any(String),
    );
    expect(authRepository.saveVerificationTokenVerifier).not.toHaveBeenCalled();
  });

  it('rejects a legacy raw reset token without falling back to plaintext storage', async () => {
    user.verificationToken = verificationToken;

    await expect(
      authService.resetPassword(user.id, verificationToken, 'NewPassword1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(authRepository.consumePasswordResetToken).not.toHaveBeenCalled();
  });

  it('returns the same recovery success response for known and unknown addresses', async () => {
    const knownResult = await authService.sendForgotPasswordEmail('amina@example.com');
    authRepository.findUserByEmail.mockResolvedValue(null);
    const unknownResult = await authService.sendForgotPasswordEmail('unknown@example.com');

    expect(knownResult).toEqual(genericRecoveryResponse);
    expect(unknownResult).toEqual(genericRecoveryResponse);
    expect(mailService.sendResetPasswordEmail).toHaveBeenCalledTimes(1);
    expect(authRepository.saveVerificationTokenVerifier).toHaveBeenCalledTimes(1);
  });

  it('keeps account-lookup failures generic and sends no email', async () => {
    const loggerWarning = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    authRepository.findUserByEmail.mockRejectedValue(
      new Error('private lookup failure for amina@example.com'),
    );

    await expect(
      authService.sendForgotPasswordEmail('amina@example.com'),
    ).resolves.toEqual(genericRecoveryResponse);

    expect(mailService.sendResetPasswordEmail).not.toHaveBeenCalled();
    expect(loggerWarning).toHaveBeenCalledWith(
      'Password recovery request could not be completed',
    );
    expect(loggerWarning.mock.calls[0]).toHaveLength(1);
    loggerWarning.mockRestore();
  });

  it('keeps password recovery response generic when email delivery fails', async () => {
    const loggerWarning = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    mailService.sendResetPasswordEmail.mockRejectedValue(
      new Error('private provider failure for amina@example.com'),
    );

    await expect(
      authService.sendForgotPasswordEmail('amina@example.com'),
    ).resolves.toEqual(genericRecoveryResponse);

    expect(loggerWarning).toHaveBeenCalledWith(
      'Password recovery request could not be completed',
    );
    expect(loggerWarning.mock.calls[0]).toHaveLength(1);
    loggerWarning.mockRestore();
  });

  it('limits repeated resends while allowing another account to request one', async () => {
    user.verificationTokenExpiresAt = new Date(Date.now() - 15 * 60_000 - 1);
    await authService.resendVerificationCode(user.id);

    authRepository.reserveEmailVerificationToken.mockResolvedValueOnce({ status: 'rate-limited', retryAfterSeconds: 60 });

    let rateLimitError: unknown;
    try {
      await authService.resendVerificationCode(user.id);
    } catch (error) {
      rateLimitError = error;
    }
    expect(rateLimitError).toBeInstanceOf(HttpException);
    if (!(rateLimitError instanceof HttpException)) {
      throw new Error('Resend cooldown did not return an HTTP exception');
    }
    expect(rateLimitError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);

    authRepository.findUserById.mockResolvedValue({
      ...user,
      id: 'another-user',
      verificationTokenExpiresAt: new Date(Date.now() - 15 * 60_000 - 1),
    });
    authRepository.reserveEmailVerificationToken.mockResolvedValueOnce({ status: 'reserved', user: { ...user, id: 'another-user' } });
    await expect(
      authService.resendVerificationCode('another-user'),
    ).resolves.toMatchObject({ message: expect.stringContaining('sent') });
    expect(mailService.sendVerificationEmail).toHaveBeenCalledTimes(2);
  });
});

describe('AuthService frontend URL configuration', () => {
  async function compileWithConfig(values: Record<string, string>, repository: object = {}, mail: object = {}) {
    return Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: repository },
        { provide: TokenService, useValue: {} },
        { provide: MailService, useValue: mail },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => values[key] },
        },
      ],
    }).compile();
  }

  it('requires an HTTPS frontend URL in production', async () => {
    await expect(compileWithConfig({ NODE_ENV: 'production' })).rejects.toThrow(
      'FRONTEND_URL must be configured in production',
    );
    await expect(
      compileWithConfig({
        NODE_ENV: 'production',
        FRONTEND_URL: 'http://app.fleetora.test',
      }),
    ).rejects.toThrow('FRONTEND_URL must be a valid trusted frontend URL');
  });

  it('rejects frontend URLs containing credentials or request parameters', async () => {
    await expect(
      compileWithConfig({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://user:pass@app.fleetora.test',
      }),
    ).rejects.toThrow('FRONTEND_URL must be a valid trusted frontend URL');
    await expect(
      compileWithConfig({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://app.fleetora.test?next=https://evil.test',
      }),
    ).rejects.toThrow('FRONTEND_URL must be a valid trusted frontend URL');
  });

  it('parses numeric environment configuration before hashing passwords', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-13T10:37:00Z'));
    const repository = {
      createUserWithDefaultCompany: vi.fn().mockResolvedValue({ user: { id: 'fixture', email: 'config@example.invalid', fullName: 'Fixture' } }),
      saveVerificationTokenVerifier: vi.fn().mockResolvedValue(undefined),
    };
    const mail = { sendVerificationEmail: vi.fn().mockResolvedValue(undefined) };
    try {
      const module = await compileWithConfig({ SALT_ROUNDS: '4', VERIFICATION_CODE_EXPIRY_MINUTES: '15' }, repository, mail);
      await module.get(AuthService).signup({ name: 'Fixture', email: 'config@example.invalid', password: 'NewPassword1' });
      expect(await bcrypt.compare('NewPassword1', repository.createUserWithDefaultCompany.mock.calls[0][2])).toBe(true);
      expect(repository.saveVerificationTokenVerifier.mock.calls[0][2].getTime() - Date.now()).toBe(15 * 60_000);
      expect(mail.sendVerificationEmail.mock.calls[0][3]).toBe(15);
      await module.close();
    } finally { vi.useRealTimers(); }
  });

  for (const key of ['SALT_ROUNDS', 'VERIFICATION_CODE_EXPIRY_MINUTES']) {
    it(`fails closed for invalid ${key} without echoing its value`, async () => {
      await expect(compileWithConfig({ [key]: 'private-invalid-value' })).rejects.toThrow(key);
      await expect(compileWithConfig({ [key]: 'private-invalid-value' })).rejects.not.toThrow('private-invalid-value');
    });
  }
});
