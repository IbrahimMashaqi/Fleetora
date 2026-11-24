import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemorySigninRateLimiter } from './signin-rate-limiter.js';
import { InMemoryRecoveryRateLimiter } from './recovery-rate-limiter.js';

describe('InMemorySigninRateLimiter', () => {
  const config = new ConfigService({
    ACCESS_TOKEN_SECRET: 'test-only-rate-limit-key',
    SIGNIN_RATE_LIMIT_WINDOW_MS: 60_000,
    SIGNIN_RATE_LIMIT_PAIR_MAX: 3,
    SIGNIN_RATE_LIMIT_ACCOUNT_MAX: 5,
    SIGNIN_RATE_LIMIT_SOURCE_MAX: 8,
  });
  let limiter: InMemorySigninRateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T10:00:00.000Z'));
    limiter = new InMemorySigninRateLimiter(config);
  });
  afterEach(() => vi.useRealTimers());

  const attempts = (source: string | null, account: string, count: number) =>
    Array.from({ length: count }, () => limiter.consume(source, account).allowed);

  it('uses secure defaults when no limits are configured', () => {
    const defaults = new InMemorySigninRateLimiter(new ConfigService({ ACCESS_TOKEN_SECRET: 'k' }));
    const results = Array.from({ length: 11 }, () => defaults.consume('ip:203.0.113.1', 'a@example.com').allowed);
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(defaults.consume('ip:203.0.113.1', 'a@example.com').retryAfterSeconds).toBe(15 * 60);
  });

  it('limits repeated guesses from one source against one account', () => {
    expect(attempts('ip:203.0.113.1', 'amina@example.com', 4)).toEqual([true, true, true, false]);
  });

  it('treats email case and surrounding whitespace as the same account', () => {
    limiter.consume('ip:203.0.113.1', ' Amina@Example.com ');
    limiter.consume('ip:203.0.113.1', 'AMINA@example.com');
    limiter.consume('ip:203.0.113.1', 'amina@example.com');
    expect(limiter.consume('ip:203.0.113.1', 'amina@EXAMPLE.com').allowed).toBe(false);
  });

  it('limits one account across rotating sources', () => {
    const results = ['1', '2', '3', '4', '5', '6'].map((n) => limiter.consume(`ip:203.0.113.${n}`, 'victim@example.com').allowed);
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it('limits credential stuffing across many accounts from one source', () => {
    const results = Array.from({ length: 9 }, (_, n) => limiter.consume('ip:203.0.113.9', `user${n}@example.com`).allowed);
    expect(results.slice(0, 8).every(Boolean)).toBe(true);
    expect(results[8]).toBe(false);
    expect(limiter.consume('ip:203.0.113.10', 'user0@example.com').allowed).toBe(true);
  });

  it('applies only the account limit to unattributed traffic, so no shared bucket exists', () => {
    for (let n = 0; n < 50; n++) expect(limiter.consume(null, `user${n}@example.com`).allowed).toBe(true);
    expect(attempts(null, 'victim@example.com', 6)).toEqual([true, true, true, true, true, false]);
  });

  it('refunds the account and pair reservation after a successful sign-in, but never the source', () => {
    for (let n = 0; n < 6; n++) {
      expect(limiter.consume('ip:203.0.113.1', 'owner@example.com').allowed).toBe(true);
      limiter.release('ip:203.0.113.1', 'owner@example.com');
    }
    expect(attempts('ip:203.0.113.1', 'other@example.com', 3)).toEqual([true, true, false]);
  });

  it('never refunds below zero or creates counters on release', () => {
    limiter.release('ip:203.0.113.1', 'never-tried@example.com');
    expect(attempts('ip:203.0.113.1', 'never-tried@example.com', 4)).toEqual([true, true, true, false]);
  });

  it('expires counters at the window boundary', () => {
    attempts('ip:203.0.113.1', 'amina@example.com', 3);
    expect(limiter.consume('ip:203.0.113.1', 'amina@example.com')).toEqual({ allowed: false, retryAfterSeconds: 60 });
    vi.advanceTimersByTime(30_000);
    expect(limiter.consume('ip:203.0.113.1', 'amina@example.com')).toEqual({ allowed: false, retryAfterSeconds: 30 });
    vi.advanceTimersByTime(30_001);
    expect(limiter.consume('ip:203.0.113.1', 'amina@example.com').allowed).toBe(true);
  });

  it('keeps a locked account locked while 20,000+ fake emails flood the bounded store', () => {
    const flooded = new InMemorySigninRateLimiter(new ConfigService({
      ACCESS_TOKEN_SECRET: 'test-only-rate-limit-key',
      SIGNIN_RATE_LIMIT_ACCOUNT_MAX: 3,
    }));
    for (const n of [1, 2, 3]) {
      expect(flooded.consume(`ip:198.51.100.${n}`, 'victim@example.com').allowed).toBe(true);
    }
    expect(flooded.consume('ip:198.51.100.4', 'victim@example.com').allowed).toBe(false);

    let refused = 0;
    for (let n = 0; n < 20_500; n++) {
      const source = n % 2 === 0 ? null : `ip:10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
      if (!flooded.consume(source, `fake-${n}@example.com`).allowed) refused++;
    }

    // Unlocked fake accounts make room for each other, so the flood itself is never refused...
    expect(refused).toBe(0);
    // ...but the locked victim's counter is never evicted.
    expect(flooded.consume('ip:198.51.100.5', 'victim@example.com')).toEqual({
      allowed: false,
      retryAfterSeconds: 15 * 60,
    });
  });

  it('lets a new real account sign in after 20,500 one-attempt fake emails fill the store', () => {
    const flooded = new InMemorySigninRateLimiter(new ConfigService({
      ACCESS_TOKEN_SECRET: 'test-only-rate-limit-key',
    }));
    for (let n = 0; n < 20_500; n++) flooded.consume(null, `fake-${n}@example.com`);

    expect(flooded.consume('ip:198.51.100.20', 'real-user@example.com')).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    expect(flooded.consume(null, 'another-real-user@example.com').allowed).toBe(true);
  });

  it('keeps sign-in and recovery counters independent', () => {
    const recovery = new InMemoryRecoveryRateLimiter(config);
    attempts('ip:203.0.113.1', 'amina@example.com', 4);
    expect(recovery.consume('ip:203.0.113.1', 'amina@example.com').allowed).toBe(true);
  });
});

describe('InMemoryRecoveryRateLimiter unattributed sources', () => {
  it('applies only the account limit and never a shared source bucket', () => {
    const limiter = new InMemoryRecoveryRateLimiter(new ConfigService({
      ACCESS_TOKEN_SECRET: 'test-only-rate-limit-key',
      RECOVERY_RATE_LIMIT_ACCOUNT_MAX: 2,
      RECOVERY_RATE_LIMIT_SOURCE_MAX: 3,
    }));
    for (let n = 0; n < 20; n++) expect(limiter.consume(null, `user${n}@example.com`).allowed).toBe(true);
    expect([1, 2, 3].map(() => limiter.consume(null, 'victim@example.com').allowed)).toEqual([true, true, false]);
  });
});
