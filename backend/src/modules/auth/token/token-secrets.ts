import type { ConfigService } from '@nestjs/config';

export const JWT_ALGORITHM = 'HS256';
export type TokenType = 'access' | 'refresh';

const misconfigured =
  'ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must be set to different non-empty values';

function secret(config: ConfigService, key: string): string | undefined {
  const value = config.get<string>(key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Issuers and refresh verification need both secrets, and they must differ. */
export function readTokenSecrets(config: ConfigService): { access: string; refresh: string } {
  const access = secret(config, 'ACCESS_TOKEN_SECRET');
  const refresh = secret(config, 'REFRESH_TOKEN_SECRET');
  if (!access || !refresh || access === refresh) throw new Error(misconfigured);
  return { access, refresh };
}

/** Access verification needs its own secret; a configured refresh secret must still differ. */
export function readAccessTokenSecret(config: ConfigService): string {
  const access = secret(config, 'ACCESS_TOKEN_SECRET');
  const refresh = secret(config, 'REFRESH_TOKEN_SECRET');
  if (!access || access === refresh) throw new Error(misconfigured);
  return access;
}

export function hasTokenType(claims: unknown, type: TokenType): boolean {
  return typeof claims === 'object' && claims !== null && 'typ' in claims && claims.typ === type;
}
