import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

export type RecoveryRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

/**
 * `source` is a trusted rate-limit identity (see `rateLimitSource`). A null source
 * means the caller could not be attributed: only the per-account limit applies, so
 * unattributed traffic never shares one exhaustible bucket.
 */
export interface RecoveryRateLimiter {
  consume(source: string | null, accountIdentifier: string): RecoveryRateLimitResult;
}

export const RECOVERY_RATE_LIMITER = Symbol('RECOVERY_RATE_LIMITER');

type Counter = {
  count: number;
  resetAt: number;
};

type LimitDefaults = {
  windowMs: number;
  pairMax: number;
  accountMax: number;
  sourceMax: number;
  maxEntries: number;
};

export function digestRecoveryRateLimitKey(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/** Bounded, HMAC-keyed counters. Raw sources and account identifiers are never retained. */
export class InMemoryHmacRateLimiter {
  private readonly counters = new Map<string, Counter>();
  private readonly secret: string;
  private readonly windowMs: number;
  private readonly pairMax: number;
  private readonly accountMax: number;
  private readonly sourceMax: number;
  private readonly maxEntries: number;

  protected constructor(
    config: ConfigService,
    prefix: string,
    secretKeys: readonly string[],
    defaults: LimitDefaults,
  ) {
    this.secret =
      secretKeys.map((key) => config.get<string>(key)).find((value) => !!value) ?? '';
    if (!this.secret) {
      throw new Error(`${secretKeys.join(' or ')} must be configured`);
    }
    const setting = (name: string, fallback: number) =>
      this.positiveInteger(config.get<number | string>(`${prefix}_${name}`), fallback);
    this.windowMs = setting('WINDOW_MS', defaults.windowMs);
    this.pairMax = setting('PAIR_MAX', defaults.pairMax);
    this.accountMax = setting('ACCOUNT_MAX', defaults.accountMax);
    this.sourceMax = setting('SOURCE_MAX', defaults.sourceMax);
    this.maxEntries = setting('MAX_ENTRIES', defaults.maxEntries);
  }

  // Synchronous by design: the check and the increment cannot interleave with
  // another request, so concurrent attempts cannot all observe the same count.
  consume(source: string | null, accountIdentifier: string): RecoveryRateLimitResult {
    const now = Date.now();
    this.removeExpired(now);

    const limits = this.limits(source, accountIdentifier);
    const blocked = limits
      .map(({ key, max }) => ({ counter: this.counters.get(key), max }))
      .find(({ counter, max }) => counter !== undefined && counter.count >= max);
    if (blocked?.counter) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((blocked.counter.resetAt - now) / 1000),
        ),
      };
    }

    for (const { key } of limits) {
      const current = this.counters.get(key);
      this.counters.delete(key);
      this.counters.set(key, {
        count: (current?.count ?? 0) + 1,
        resetAt: current?.resetAt ?? now + this.windowMs,
      });
    }
    this.enforceBound();
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Returns one reservation to the pair and account counters; source counters are never refunded. */
  protected refund(source: string | null, accountIdentifier: string): void {
    this.removeExpired(Date.now());
    for (const { key, kind } of this.limits(source, accountIdentifier)) {
      if (kind === 'source') continue;
      const current = this.counters.get(key);
      if (current && current.count > 0) current.count -= 1;
    }
  }

  private limits(source: string | null, accountIdentifier: string) {
    const accountKey = this.digest(`account:${accountIdentifier.trim().toLowerCase()}`);
    const limits: { key: string; max: number; kind: 'pair' | 'account' | 'source' }[] = [
      { key: accountKey, max: this.accountMax, kind: 'account' },
    ];
    // Only an explicit null is unattributed; an empty string keeps the legacy shared key.
    if (source !== null) {
      const sourceKey = this.digest(`source:${source.trim() || 'unknown'}`);
      limits.unshift({ key: this.digest(`pair:${sourceKey}:${accountKey}`), max: this.pairMax, kind: 'pair' });
      limits.push({ key: sourceKey, max: this.sourceMax, kind: 'source' });
    }
    return limits;
  }

  private digest(value: string): string {
    return digestRecoveryRateLimitKey(this.secret, value);
  }

  private removeExpired(now: number): void {
    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) this.counters.delete(key);
    }
  }

  private enforceBound(): void {
    while (this.counters.size > this.maxEntries) {
      const oldestKey = this.counters.keys().next().value as string | undefined;
      if (oldestKey === undefined) return;
      this.counters.delete(oldestKey);
    }
  }

  private positiveInteger(value: number | string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}

@Injectable()
export class InMemoryRecoveryRateLimiter
  extends InMemoryHmacRateLimiter
  implements RecoveryRateLimiter
{
  constructor(config: ConfigService) {
    super(config, 'RECOVERY_RATE_LIMIT', ['RECOVERY_RATE_LIMIT_KEY', 'ACCESS_TOKEN_SECRET'], {
      windowMs: 15 * 60_000,
      pairMax: 3,
      accountMax: 5,
      sourceMax: 50,
      maxEntries: 10_000,
    });
  }
}
