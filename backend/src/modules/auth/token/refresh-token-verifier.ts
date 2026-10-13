import { createHash, timingSafeEqual } from 'node:crypto';

const prefix = 'refresh:sha256:v1:';
const verifierPattern = /^refresh:sha256:v1:([a-f0-9]{64})$/;

export function createRefreshTokenVerifier(token: string): string {
  return prefix + createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isLegacyRefreshTokenVerifier(verifier: string): boolean {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(verifier);
}

export function matchesRefreshTokenVerifier(token: string, verifier: string): boolean {
  const expected = verifier.match(verifierPattern)?.[1];
  if (!expected) return false;
  const actual = createHash('sha256').update(token, 'utf8').digest();
  return timingSafeEqual(Buffer.from(expected, 'hex'), actual);
}
