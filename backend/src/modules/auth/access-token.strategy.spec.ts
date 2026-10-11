import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { AccessTokenGuard } from './guards/access-token.guard.js';
import { RefreshTokenGuard } from './guards/refresh-token.guard.js';
import { AccessTokenStrategy } from './strategies/access-token.strategy.js';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy.js';
import type { TokenPayload } from './token/token.payload.js';
import { RECOVERY_RATE_LIMITER } from './recovery-rate-limiter.js';

const accessSecret = 'test-access-secret';
const refreshSecret = 'test-refresh-secret';
const user = {
  id: 'user-1', email: 'amina@example.com', fullName: 'Amina Hassan',
  password: 'hashed-password', role: 'COMPANY_ADMIN', companyId: 'company-1',
  isActive: true, isEmailVerified: true, refreshToken: 'hashed-refresh',
};

describe('AccessTokenStrategy account status enforcement', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let accessTokenStrategy: AccessTokenStrategy;
  let authRepository: {
    findUserById: ReturnType<typeof vi.fn>;
    isCompanyActiveForUser: ReturnType<typeof vi.fn>;
  };
  let authService: { getSessionUser: ReturnType<typeof vi.fn>; updatePassword: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    authRepository = {
      findUserById: vi.fn().mockResolvedValue({ ...user }),
      isCompanyActiveForUser: vi.fn().mockResolvedValue(true),
    };
    authService = {
      getSessionUser: vi.fn().mockResolvedValue({ id: user.id, name: user.fullName, email: user.email }),
      updatePassword: vi.fn().mockResolvedValue({ success: true, message: 'Password updated successfully' }),
    };
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({})],
      controllers: [AuthController],
      providers: [
        AccessTokenStrategy, RefreshTokenStrategy, AccessTokenGuard, RefreshTokenGuard,
        { provide: AuthService, useValue: authService },
        { provide: AuthRepository, useValue: authRepository },
        {
          provide: RECOVERY_RATE_LIMITER,
          useValue: {
            consume: vi.fn().mockReturnValue({
              allowed: true,
              retryAfterSeconds: 0,
            }),
          },
        },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'ACCESS_TOKEN_SECRET' ? accessSecret : refreshSecret } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    jwt = module.get(JwtService);
    accessTokenStrategy = module.get(AccessTokenStrategy);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    authRepository.findUserById.mockResolvedValue({ ...user });
    authRepository.isCompanyActiveForUser.mockResolvedValue(true);
    authService.getSessionUser.mockResolvedValue({ id: user.id, name: user.fullName, email: user.email });
    authService.updatePassword.mockResolvedValue({ success: true, message: 'Password updated successfully' });
  });

  afterAll(async () => {
    await app.close();
  });

  async function signedAccessToken() {
    return jwt.signAsync({ sub: user.id, email: user.email, role: user.role, orgId: user.companyId }, {
      secret: accessSecret, expiresIn: '1h',
    });
  }

  it('allows a valid signed token for an active, verified account', async () => {
    const token = await signedAccessToken();
    await request(app.getHttpServer()).get('/auth/session').set('Authorization', `Bearer ${token}`).expect(200);
    expect(authRepository.findUserById).toHaveBeenCalledWith(user.id);
    expect(authService.getSessionUser).toHaveBeenCalledWith(user.id);
  });

  it('uses the current database role and company in the protected request context', async () => {
    authRepository.findUserById.mockResolvedValue({
      ...user,
      email: 'new-address@example.com',
      role: 'ACCOUNTANT',
      companyId: 'company-2',
    });
    const token = await signedAccessToken();
    const payload = await jwt.verifyAsync<TokenPayload>(token, { secret: accessSecret });

    await expect(accessTokenStrategy.validate(payload)).resolves.toEqual({
      sub: user.id,
      email: 'new-address@example.com',
      role: 'ACCOUNTANT',
      orgId: 'company-2',
    });
  });

  it('rejects an inactive account before the protected controller runs', async () => {
    authRepository.findUserById.mockResolvedValue({ ...user, isActive: false });
    const token = await signedAccessToken();
    const response = await request(app.getHttpServer()).get('/auth/session').set('Authorization', `Bearer ${token}`).expect(401);
    expect(response.body.message).toBe('Unauthorized');
    expect(authService.getSessionUser).not.toHaveBeenCalled();
  });

  it('rejects a deleted account before the protected controller runs', async () => {
    authRepository.findUserById.mockResolvedValue(null);
    const token = await signedAccessToken();
    const response = await request(app.getHttpServer()).get('/auth/session').set('Authorization', `Bearer ${token}`).expect(401);
    expect(response.body.message).toBe('Unauthorized');
    expect(authService.getSessionUser).not.toHaveBeenCalled();
  });

  it('rejects an unverified account before the protected controller runs', async () => {
    authRepository.findUserById.mockResolvedValue({ ...user, isEmailVerified: false });
    const token = await signedAccessToken();
    const response = await request(app.getHttpServer()).get('/auth/session').set('Authorization', `Bearer ${token}`).expect(401);
    expect(response.body.message).toBe('Unauthorized');
    expect(authService.getSessionUser).not.toHaveBeenCalled();
  });

  it('rejects users in suspended companies before protected controllers run', async () => {
    authRepository.isCompanyActiveForUser.mockResolvedValue(false);
    const token = await signedAccessToken();
    const response = await request(app.getHttpServer()).get('/auth/session').set('Authorization', `Bearer ${token}`).expect(401);
    expect(response.body.message).toBe('Unauthorized');
    expect(authService.getSessionUser).not.toHaveBeenCalled();
  });

  it('rejects a platform admin with a tenant association before protected controllers run', async () => {
    authRepository.findUserById.mockResolvedValue({ ...user, role: 'PLATFORM_ADMIN' });
    authRepository.isCompanyActiveForUser.mockResolvedValue(false);
    const token = await signedAccessToken();

    await request(app.getHttpServer())
      .get('/auth/session')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(authService.getSessionUser).not.toHaveBeenCalled();
  });

  it('blocks password updates when the account is no longer active', async () => {
    authRepository.findUserById.mockResolvedValue({ ...user, isActive: false });
    const token = await signedAccessToken();
    await request(app.getHttpServer())
      .post('/auth/update-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: 'old-password', newPassword: 'NewPassword1' })
      .expect(401);
    expect(authService.updatePassword).not.toHaveBeenCalled();
  });

  it('blocks password updates when the company is suspended', async () => {
    authRepository.isCompanyActiveForUser.mockResolvedValue(false);
    const token = await signedAccessToken();
    await request(app.getHttpServer())
      .post('/auth/update-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: 'old-password', newPassword: 'NewPassword1' })
      .expect(401);
    expect(authService.updatePassword).not.toHaveBeenCalled();
  });

  it('rejects status failures without identifying missing or unauthorized accounts', async () => {
    const token = await signedAccessToken();
    authRepository.findUserById.mockResolvedValue(null);
    const missing = await request(app.getHttpServer()).get('/auth/session').set('Authorization', `Bearer ${token}`).expect(401);
    authRepository.findUserById.mockResolvedValue({ ...user, isActive: false });
    const inactive = await request(app.getHttpServer()).get('/auth/session').set('Authorization', `Bearer ${token}`).expect(401);
    expect(missing.body.message).toBe(inactive.body.message);
  });
});
