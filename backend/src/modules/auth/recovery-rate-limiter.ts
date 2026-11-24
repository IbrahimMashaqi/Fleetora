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

type CounterKind = 'pair' | 'account' | 'source';

type Limit = { key: string; max: number; kind: CounterKind };

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

/**
 * Bounded, HMAC-keyed counters. Raw sources and account identifiers are never retained.
 *
 * A locked account counter (at its limit, inside its window) protects a victim, so it is
 * never evicted. When the bound is reached, pair and source counters are evicted oldest
 * first, then unlocked account counters oldest first; the attempt is refused only when
 * everything left is locked or belongs to it, so a flood cannot block every sign-in.
 * Each map keeps creation order, which equals expiry order because the window is fixed.
 */
export class InMemoryHmacRateLimiter {
  private readonly accounts = new Map<string, Counter>();
  private readonly others = new Map<string, Counter>();
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
      .map(({ key, max, kind }) => ({ counter: this.live(kind, key, now), max }))
      .find(({ counter, max }) => counter !== undefined && counter.count >= max);
    if (blocked?.counter) return this.refusal(blocked.counter.resetAt, now);

    const needed = limits.filter(({ key, kind }) => !this.live(kind, key, now)).length;
    if (!this.makeRoom(needed, limits)) return this.refusal(this.nextExpiry(now), now);

    for (const { key, kind } of limits) {
      const counters = this.store(kind);
      const current = counters.get(key);
      if (current) current.count += 1;
      else counters.set(key, { count: 1, resetAt: now + this.windowMs });
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Returns one reservation to the pair and account counters; source counters are never refunded. */
  protected refund(source: string | null, accountIdentifier: string): void {
    const now = Date.now();
    this.removeExpired(now);
    for (const { key, kind } of this.limits(source, accountIdentifier)) {
      if (kind === 'source') continue;
      const current = this.live(kind, key, now);
      if (current && current.count > 0) current.count -= 1;
    }
  }

  private limits(source: string | null, accountIdentifier: string): Limit[] {
    const accountKey = this.digest(`account:${accountIdentifier.trim().toLowerCase()}`);
    const limits: Limit[] = [
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

  private store(kind: CounterKind): Map<string, Counter> {
    return kind === 'account' ? this.accounts : this.others;
  }

  /** A counter inside its window; an expired one is removed even if the clock moved backwards. */
  private live(kind: CounterKind, key: string, now: number): Counter | undefined {
    const counters = this.store(kind);
    const counter = counters.get(key);
    if (counter && counter.resetAt <= now) {
      counters.delete(key);
      return undefined;
    }
    return counter;
  }

  private get size(): number {
    return this.accounts.size + this.others.size;
  }

  private removeExpired(now: number): void {
    for (const counters of [this.accounts, this.others]) {
      for (const [key, counter] of counters) {
        if (counter.resetAt > now) break;
        counters.delete(key);
      }
    }
  }

  /**
   * Evicts the oldest pair/source counters, then the oldest unlocked account counters.
   * Never evicts this attempt's own counters or a locked account counter.
   */
  private makeRoom(needed: number, limits: readonly Limit[]): boolean {
    const own = new Set(limits.map(({ key }) => key));
    const fits = () => this.size + needed <= this.maxEntries;
    for (const key of this.others.keys()) {
      if (fits()) return true;
      if (!own.has(key)) this.others.delete(key);
    }
    for (const [key, counter] of this.accounts) {
      if (fits()) return true;
      if (!own.has(key) && counter.count < this.accountMax) this.accounts.delete(key);
    }
    return fits();
  }

  private nextExpiry(now: number): number {
    const heads = [this.accounts, this.others]
      .map((counters) => counters.values().next().value?.resetAt)
      .filter((resetAt): resetAt is number => resetAt !== undefined);
    return heads.length ? Math.min(...heads) : now + this.windowMs;
  }

  private refusal(resetAt: number, now: number): RecoveryRateLimitResult {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
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
