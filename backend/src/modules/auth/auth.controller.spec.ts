import { MethodNotAllowedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { ConfigService } from '@nestjs/config';
import { RECOVERY_RATE_LIMITER } from './recovery-rate-limiter.js';
import { SIGNIN_RATE_LIMITER } from './signin-rate-limiter.js';
import { ClientSourceService } from './client-source.js';

describe('AuthController email verification boundary', () => {
  it('does not redeem verification tokens through GET', async () => {
    const verifyEmail = vi.fn();
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { verifyEmail } },
        { provide: RECOVERY_RATE_LIMITER, useValue: { consume: vi.fn() } },
        { provide: SIGNIN_RATE_LIMITER, useValue: { consume: () => ({ allowed: true, retryAfterSeconds: 0 }), release: () => undefined } },
        { provide: ClientSourceService, useValue: new ClientSourceService(new ConfigService({})) },
      ],
    }).compile();
    const controller = module.get(AuthController);

    expect(() => controller.verifyEmailGet()).toThrow(
      MethodNotAllowedException,
    );
    expect(verifyEmail).not.toHaveBeenCalled();
  });

  it('redeems only through the explicit POST body', async () => {
    const verifyEmail = vi.fn().mockResolvedValue({ message: 'Email verified' });
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { verifyEmail } },
        { provide: RECOVERY_RATE_LIMITER, useValue: { consume: vi.fn() } },
        { provide: SIGNIN_RATE_LIMITER, useValue: { consume: () => ({ allowed: true, retryAfterSeconds: 0 }), release: () => undefined } },
        { provide: ClientSourceService, useValue: new ClientSourceService(new ConfigService({})) },
      ],
    }).compile();
    const controller = module.get(AuthController);
    const dto = { userId: 'user-1', token: 'a'.repeat(64) };

    await expect(controller.verifyEmail(dto)).resolves.toEqual({
      message: 'Email verified',
    });
    expect(verifyEmail).toHaveBeenCalledWith(dto.userId, dto.token);
  });

  it('counts recovery requests before account lookup and returns a generic throttle error', async () => {
    const sendForgotPasswordEmail = vi.fn();
    const consume = vi
      .fn()
      .mockReturnValue({ allowed: false, retryAfterSeconds: 300 });
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { sendForgotPasswordEmail } },
        { provide: RECOVERY_RATE_LIMITER, useValue: { consume } },
        { provide: SIGNIN_RATE_LIMITER, useValue: { consume: () => ({ allowed: true, retryAfterSeconds: 0 }), release: () => undefined } },
        { provide: ClientSourceService, useValue: new ClientSourceService(new ConfigService({})) },
      ],
    }).compile();
    const controller = module.get(AuthController);

    await expect(
      controller.forgotPassword(
        { email: ' Amina@Example.com ' },
        { ip: '203.0.113.8', method: 'POST', originalUrl: '/auth/forgot-password', get: () => undefined },
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(consume).toHaveBeenCalledWith(
      'ip:203.0.113.8',
      ' Amina@Example.com ',
    );
    expect(sendForgotPasswordEmail).not.toHaveBeenCalled();
  });
});
