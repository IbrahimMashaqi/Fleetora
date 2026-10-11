import { createHash, timingSafeEqual } from 'node:crypto';

export type OneTimeTokenPurpose = 'email-verification' | 'password-reset';

const rawTokenPattern = /^[a-f0-9]{64}$/i;

export function createOneTimeTokenVerifier(
  rawToken: string,
  purpose: OneTimeTokenPurpose,
): string | null {
  if (!rawTokenPattern.test(rawToken)) return null;

  const digest = createHash('sha256').update(rawToken).digest('hex');
  return `${purpose}:sha256:${digest}`;
}

export function matchesOneTimeTokenVerifier(
  storedVerifier: string | null,
  candidateVerifier: string | null,
  purpose: OneTimeTokenPurpose,
): boolean {
  const pattern = new RegExp(`^${purpose}:sha256:([a-f0-9]{64})$`);
  const storedDigest = storedVerifier?.match(pattern)?.[1];
  const candidateDigest = candidateVerifier?.match(pattern)?.[1];
  if (!storedDigest || !candidateDigest) return false;

  return timingSafeEqual(
    Buffer.from(storedDigest, 'hex'),
    Buffer.from(candidateDigest, 'hex'),
  );
}
