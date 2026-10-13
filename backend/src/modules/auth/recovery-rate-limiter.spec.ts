import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  digestRecoveryRateLimitKey,
  InMemoryRecoveryRateLimiter,
} from './recovery-rate-limiter.js';

describe('InMemoryRecoveryRateLimiter', () => {
  const config = new ConfigService({
    ACCESS_TOKEN_SECRET: 'test-only-rate-limit-key',
    RECOVERY_RATE_LIMIT_WINDOW_MS: 60_000,
    RECOVERY_RATE_LIMIT_PAIR_MAX: 2,
    RECOVERY_RATE_LIMIT_ACCOUNT_MAX: 3,
    RECOVERY_RATE_LIMIT_SOURCE_MAX: 20,
    RECOVERY_RATE_LIMIT_MAX_ENTRIES: 12,
  });
  let limiter: InMemoryRecoveryRateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T12:00:00.000Z'));
    limiter = new InMemoryRecoveryRateLimiter(config);
  });

  it('counts normalized identifiers without retaining raw addresses or sources', () => {
    expect(limiter.consume('203.0.113.8', ' Amina@Example.com ')).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    expect(limiter.consume('203.0.113.8', 'amina@example.com')).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });

    const rejected = limiter.consume('203.0.113.8', 'AMINA@example.com');
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBe(60);
    const digest = digestRecoveryRateLimitKey(
      'test-only-rate-limit-key',
      'account:amina@example.com',
    );
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain('amina@example.com');
  });

  it('limits one account across changing sources while avoiding a low NAT-wide cap', () => {
    for (const source of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
      expect(limiter.consume(source, 'target@example.com').allowed).toBe(true);
    }

    expect(limiter.consume('203.0.113.4', 'target@example.com').allowed).toBe(false);
    expect(limiter.consume('203.0.113.1', 'other@example.com').allowed).toBe(true);
  });

  it('expires counters at the configured window boundary', () => {
    limiter.consume('203.0.113.8', 'amina@example.com');
    limiter.consume('203.0.113.8', 'amina@example.com');
    expect(limiter.consume('203.0.113.8', 'amina@example.com').allowed).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(limiter.consume('203.0.113.8', 'amina@example.com').allowed).toBe(true);
  });

  it('honors numeric environment strings without changing the configured limits', () => {
    const configured = new InMemoryRecoveryRateLimiter(new ConfigService({
      ACCESS_TOKEN_SECRET: 'test-only-rate-limit-key',
      RECOVERY_RATE_LIMIT_WINDOW_MS: '60000',
      RECOVERY_RATE_LIMIT_PAIR_MAX: '1',
      RECOVERY_RATE_LIMIT_ACCOUNT_MAX: '10',
      RECOVERY_RATE_LIMIT_SOURCE_MAX: '20',
      RECOVERY_RATE_LIMIT_MAX_ENTRIES: '12',
    }));
    expect(configured.consume('203.0.113.8', 'amina@example.com').allowed).toBe(true);
    expect(configured.consume('203.0.113.8', 'amina@example.com')).toEqual({ allowed: false, retryAfterSeconds: 60 });
    vi.advanceTimersByTime(60_000);
    expect(configured.consume('203.0.113.8', 'amina@example.com').allowed).toBe(true);
  });

  it('evicts expired or oldest counters instead of growing without a bound', () => {
    const bounded = new InMemoryRecoveryRateLimiter(
      new ConfigService({
        ACCESS_TOKEN_SECRET: 'test-only-rate-limit-key',
        RECOVERY_RATE_LIMIT_WINDOW_MS: 60_000,
        RECOVERY_RATE_LIMIT_PAIR_MAX: 1,
        RECOVERY_RATE_LIMIT_ACCOUNT_MAX: 100,
        RECOVERY_RATE_LIMIT_SOURCE_MAX: 100,
        RECOVERY_RATE_LIMIT_MAX_ENTRIES: 6,
      }),
    );
    expect(bounded.consume('203.0.113.1', 'one@example.com').allowed).toBe(true);
    expect(bounded.consume('203.0.113.1', 'one@example.com').allowed).toBe(false);
    for (let index = 2; index < 8; index += 1) {
      bounded.consume(`203.0.113.${index}`, `user-${index}@example.com`);
    }
    expect(bounded.consume('203.0.113.1', 'one@example.com').allowed).toBe(true);
  });
});
