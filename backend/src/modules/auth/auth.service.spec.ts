import {
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { MailService } from '../mail/mail.service.js';
import { TokenService } from './token/token.service.js';

const verificationToken = 'a'.repeat(64);

describe('AuthService email verification', () => {
  let module: TestingModule;
  let authService: AuthService;
  let authRepository: {
    findUserById: ReturnType<typeof vi.fn>;
    saveVerificationCode: ReturnType<typeof vi.fn>;
    markEmailVerified: ReturnType<typeof vi.fn>;
    updateUserActevity: ReturnType<typeof vi.fn>;
  };
  let mailService: { sendVerificationEmail: ReturnType<typeof vi.fn> };
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
      verificationToken,
      verificationTokenExpiresAt: new Date(Date.now() + 60_000),
    };
    authRepository = {
      findUserById: vi.fn().mockResolvedValue(user),
      saveVerificationCode: vi
        .fn()
        .mockImplementation(
          async (_userId: string, _token: string, expiresAt: Date) => {
            user.verificationTokenExpiresAt = expiresAt;
          },
        ),
      markEmailVerified: vi.fn().mockResolvedValue(undefined),
      updateUserActevity: vi.fn().mockResolvedValue(undefined),
    };
    mailService = {
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
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
    expect(authRepository.markEmailVerified).toHaveBeenCalledWith(user.id);
    expect(authRepository.updateUserActevity).toHaveBeenCalledWith(
      user.id,
      true,
    );
  });

  it('rejects an invalid token without updating account state', async () => {
    await expect(
      authService.verifyEmail(user.id, 'b'.repeat(64)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authRepository.markEmailVerified).not.toHaveBeenCalled();
  });

  it('rejects malformed stored tokens', async () => {
    user.verificationToken = 'not-a-token';

    await expect(
      authService.verifyEmail(user.id, verificationToken),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authRepository.markEmailVerified).not.toHaveBeenCalled();
  });

  it('rejects expired tokens', async () => {
    user.verificationTokenExpiresAt = new Date(Date.now() - 1);

    await expect(
      authService.verifyEmail(user.id, verificationToken),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authRepository.markEmailVerified).not.toHaveBeenCalled();
  });

  it('returns the already-verified state without consuming another token', async () => {
    user.isEmailVerified = true;

    await expect(
      authService.verifyEmail(user.id, verificationToken),
    ).resolves.toEqual({
      message: 'Email is already verified. You can sign in.',
    });
    expect(authRepository.markEmailVerified).not.toHaveBeenCalled();
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
    expect(verificationUrl.searchParams.get('token')).toBe(verificationToken);
    expect(expiry).toBe(15);
  });

  it('limits repeated resends while allowing another account to request one', async () => {
    user.verificationTokenExpiresAt = new Date(Date.now() - 15 * 60_000 - 1);
    await authService.resendVerificationCode(user.id);

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
    await expect(
      authService.resendVerificationCode('another-user'),
    ).resolves.toMatchObject({ message: expect.stringContaining('sent') });
    expect(mailService.sendVerificationEmail).toHaveBeenCalledTimes(2);
  });
});
