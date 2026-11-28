import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenService } from './token.service.js';
import type { TokenPayload } from './token.payload.js';

const accessSecret = 'token-service-test-only-access';
const refreshSecret = 'token-service-test-only-refresh';
const payload: TokenPayload = {
  sub: '11111111-1111-4111-8111-111111111111',
  email: 'token@example.invalid', role: 'COMPANY_ADMIN',
  orgId: '22222222-2222-4222-8222-222222222222',
};

describe('TokenService real JWT issuance', () => {
  const jwt = new JwtService();
  const service = new TokenService(jwt, new ConfigService({
    ACCESS_TOKEN_SECRET: accessSecret, REFRESH_TOKEN_SECRET: refreshSecret,
  }));
  afterEach(() => vi.useRealTimers());

  it('preserves platform and company revocation versions without signing display-only approval claims', async () => {
    const company = jwt.decode(await service.generateAccessToken({...payload, companyVersion: 7, companyStatus: 'ACTIVE'}));
    expect(company).toMatchObject({companyVersion: 7});
    expect(company).not.toHaveProperty('companyStatus');
    const platform = jwt.decode(await service.generateAccessToken({...payload, role:'PLATFORM_ADMIN',orgId:'',sessionVersion:4,companyVersion:7}));
    expect(platform).toMatchObject({sessionVersion:4});
    expect(platform).not.toHaveProperty('companyVersion');
  });

  it('issues distinct refresh tokens even within one second', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
    const first = await service.generateRefreshToken(payload);
    const second = await service.generateRefreshToken(payload);
    expect(second).not.toBe(first);
    const claims = await jwt.verifyAsync(second, { secret: refreshSecret });
    expect(claims.sub).toBe(payload.sub);
    expect(claims.jti).toEqual(expect.any(String));
    expect(claims.exp - claims.iat).toBe(7 * 24 * 60 * 60);
  });

  it('preserves the access-token identity and ten-minute lifetime', async () => {
    const token = await service.generateAccessToken(payload);
    const claims = await jwt.verifyAsync(token, { secret: accessSecret });
    expect(claims).toMatchObject(payload);
    expect(claims.exp - claims.iat).toBe(600);
  });

  it('labels each token with its explicit type and signs with HS256', async () => {
    const access = await service.generateAccessToken(payload);
    const refresh = await service.generateRefreshToken(payload);
    expect(jwt.decode(access, { complete: true })).toMatchObject({
      header: { alg: 'HS256' }, payload: { typ: 'access' },
    });
    expect(jwt.decode(refresh, { complete: true })).toMatchObject({
      header: { alg: 'HS256' }, payload: { typ: 'refresh' },
    });
  });

  it('never lets a caller-supplied payload type override the issued type', async () => {
    const forged = { ...payload, typ: 'refresh' } as TokenPayload;
    const token = await service.generateAccessToken(forged);
    expect(jwt.decode(token)).toMatchObject({ typ: 'access' });
  });

  it('signs each token type with its own secret', async () => {
    const access = await service.generateAccessToken(payload);
    const refresh = await service.generateRefreshToken(payload);
    await expect(jwt.verifyAsync(access, { secret: refreshSecret })).rejects.toThrow();
    await expect(jwt.verifyAsync(refresh, { secret: accessSecret })).rejects.toThrow();
  });

  it.each([
    ['identical secrets', { ACCESS_TOKEN_SECRET: 'same-secret-value', REFRESH_TOKEN_SECRET: 'same-secret-value' }],
    ['a missing access secret', { REFRESH_TOKEN_SECRET: refreshSecret }],
    ['a missing refresh secret', { ACCESS_TOKEN_SECRET: accessSecret }],
    ['an empty access secret', { ACCESS_TOKEN_SECRET: '', REFRESH_TOKEN_SECRET: refreshSecret }],
  ])('refuses to start with %s', (_name, values) => {
    expect(() => new TokenService(jwt, new ConfigService(values))).toThrow(
      /ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET/,
    );
  });
});
