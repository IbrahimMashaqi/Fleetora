import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

export type RecoveryRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export interface RecoveryRateLimiter {
  consume(source: string, accountIdentifier: string): RecoveryRateLimitResult;
}

export const RECOVERY_RATE_LIMITER = Symbol('RECOVERY_RATE_LIMITER');

type Counter = {
  count: number;
  resetAt: number;
};

export function digestRecoveryRateLimitKey(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

@Injectable()
export class InMemoryRecoveryRateLimiter implements RecoveryRateLimiter {
  private readonly counters = new Map<string, Counter>();
  private readonly secret: string;
  private readonly windowMs: number;
  private readonly pairMax: number;
  private readonly accountMax: number;
  private readonly sourceMax: number;
  private readonly maxEntries: number;

  constructor(config: ConfigService) {
    this.secret =
      config.get<string>('RECOVERY_RATE_LIMIT_KEY') ??
      config.get<string>('ACCESS_TOKEN_SECRET') ??
      '';
    if (!this.secret) {
      throw new Error(
        'RECOVERY_RATE_LIMIT_KEY or ACCESS_TOKEN_SECRET must be configured',
      );
    }
    this.windowMs = this.positiveInteger(
      config.get<number | string>('RECOVERY_RATE_LIMIT_WINDOW_MS'),
      15 * 60_000,
    );
    this.pairMax = this.positiveInteger(
      config.get<number | string>('RECOVERY_RATE_LIMIT_PAIR_MAX'),
      3,
    );
    this.accountMax = this.positiveInteger(
      config.get<number | string>('RECOVERY_RATE_LIMIT_ACCOUNT_MAX'),
      5,
    );
    this.sourceMax = this.positiveInteger(
      config.get<number | string>('RECOVERY_RATE_LIMIT_SOURCE_MAX'),
      50,
    );
    this.maxEntries = this.positiveInteger(
      config.get<number | string>('RECOVERY_RATE_LIMIT_MAX_ENTRIES'),
      10_000,
    );
  }

  consume(source: string, accountIdentifier: string): RecoveryRateLimitResult {
    const now = Date.now();
    this.removeExpired(now);

    const normalizedSource = source.trim() || 'unknown';
    const normalizedAccount = accountIdentifier.trim().toLowerCase();
    const sourceKey = this.digest(`source:${normalizedSource}`);
    const accountKey = this.digest(`account:${normalizedAccount}`);
    const limits = [
      { key: this.digest(`pair:${sourceKey}:${accountKey}`), max: this.pairMax },
      { key: accountKey, max: this.accountMax },
      { key: sourceKey, max: this.sourceMax },
    ];

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
