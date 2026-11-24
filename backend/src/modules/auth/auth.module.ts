import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { JwtModule } from '@nestjs/jwt';
import { TokenService } from './token/token.service.js';
import { ConfigModule } from '@nestjs/config';
import { AccessTokenStrategy } from './strategies/access-token.strategy.js';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy.js';
import {
  InMemoryRecoveryRateLimiter,
  RECOVERY_RATE_LIMITER,
} from './recovery-rate-limiter.js';
import {
  InMemorySigninRateLimiter,
  SIGNIN_RATE_LIMITER,
} from './signin-rate-limiter.js';
import { ClientSourceService } from './client-source.js';

@Module({
  imports: [JwtModule, ConfigModule],
  providers: [
    AuthService,
    AuthRepository,
    TokenService,
    AccessTokenStrategy,
    RefreshTokenStrategy,
    InMemoryRecoveryRateLimiter,
    {
      provide: RECOVERY_RATE_LIMITER,
      useExisting: InMemoryRecoveryRateLimiter,
    },
    InMemorySigninRateLimiter,
    {
      provide: SIGNIN_RATE_LIMITER,
      useExisting: InMemorySigninRateLimiter,
    },
    ClientSourceService,
  ],
  controllers: [AuthController],
  exports: [AuthRepository],
})
export class AuthModule {}
