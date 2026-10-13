import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenService } from './token.service.js';
import type { TokenPayload } from './token.payload.js';

const secret = 'token-service-test-only';
const payload: TokenPayload = {
  sub: '11111111-1111-4111-8111-111111111111',
  email: 'token@example.invalid', role: 'COMPANY_ADMIN',
  orgId: '22222222-2222-4222-8222-222222222222',
};

describe('TokenService real JWT issuance', () => {
  const jwt = new JwtService();
  const service = new TokenService(jwt, new ConfigService({
    ACCESS_TOKEN_SECRET: secret, REFRESH_TOKEN_SECRET: secret,
  }));
  afterEach(() => vi.useRealTimers());

  it('issues distinct refresh tokens even within one second', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
    const first = await service.generateRefreshToken(payload);
    const second = await service.generateRefreshToken(payload);
    expect(second).not.toBe(first);
    const claims = await jwt.verifyAsync(second, { secret });
    expect(claims.sub).toBe(payload.sub);
    expect(claims.jti).toEqual(expect.any(String));
    expect(claims.exp - claims.iat).toBe(7 * 24 * 60 * 60);
  });

  it('preserves the access-token identity and ten-minute lifetime', async () => {
    const token = await service.generateAccessToken(payload);
    const claims = await jwt.verifyAsync(token, { secret });
    expect(claims).toMatchObject(payload);
    expect(claims.exp - claims.iat).toBe(600);
  });
});
