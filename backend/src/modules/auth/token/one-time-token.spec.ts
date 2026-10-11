import { describe, expect, it } from 'vitest';
import {
  createOneTimeTokenVerifier,
  matchesOneTimeTokenVerifier,
} from './one-time-token.js';

describe('one-time token verifiers', () => {
  const rawToken = 'a'.repeat(64);
  const digest = 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb';

  it('stores a purpose-bound digest instead of the redeemable token', () => {
    const verifier = createOneTimeTokenVerifier(rawToken, 'password-reset');

    expect(verifier).toBe(`password-reset:sha256:${digest}`);
    expect(verifier).not.toContain(rawToken);
    expect(createOneTimeTokenVerifier('malformed', 'password-reset')).toBeNull();
  });

  it('matches only a valid verifier for the intended token purpose', () => {
    const verifier = createOneTimeTokenVerifier(rawToken, 'email-verification');

    expect(
      matchesOneTimeTokenVerifier(verifier, verifier, 'email-verification'),
    ).toBe(true);
    expect(
      matchesOneTimeTokenVerifier(verifier, verifier, 'password-reset'),
    ).toBe(false);
    expect(
      matchesOneTimeTokenVerifier(rawToken, verifier, 'email-verification'),
    ).toBe(false);
    expect(
      matchesOneTimeTokenVerifier(verifier, 'invalid', 'email-verification'),
    ).toBe(false);
  });
});
