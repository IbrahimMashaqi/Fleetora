import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InMemoryHmacRateLimiter,
  type RecoveryRateLimitResult,
} from './recovery-rate-limiter.js';

export interface SigninRateLimiter {
  /** Reserves one attempt before credentials are checked. */
  consume(source: string | null, accountIdentifier: string): RecoveryRateLimitResult;
  /** Returns the reservation after a successful sign-in (pair and account only). */
  release(source: string | null, accountIdentifier: string): void;
}

export const SIGNIN_RATE_LIMITER = Symbol('SIGNIN_RATE_LIMITER');

@Injectable()
export class InMemorySigninRateLimiter
  extends InMemoryHmacRateLimiter
  implements SigninRateLimiter
{
  constructor(config: ConfigService) {
    super(
      config,
      'SIGNIN_RATE_LIMIT',
      ['SIGNIN_RATE_LIMIT_KEY', 'RECOVERY_RATE_LIMIT_KEY', 'ACCESS_TOKEN_SECRET'],
      {
        windowMs: 15 * 60_000,
        pairMax: 10,
        accountMax: 20,
        sourceMax: 100,
        maxEntries: 20_000,
      },
    );
  }

  release(source: string | null, accountIdentifier: string): void {
    this.refund(source, accountIdentifier);
  }
}
