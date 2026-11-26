import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { InMemoryRecoveryRateLimiter } from '../auth/recovery-rate-limiter.js';
import { MerchantAccessRepository } from './merchant-access.repository.js';
import { MerchantAccessService } from './merchant-access.service.js';
import {
  CompanyMerchantInvitationController,
  MerchantAccessController,
} from './merchant-access.controller.js';
import { MerchantAccessGuard } from './merchant-access.guard.js';
import { INVITATION_PREVIEW_LIMITER } from './merchant-access.types.js';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
  providers: [
    MerchantAccessRepository,
    MerchantAccessService,
    MerchantAccessGuard,
    InMemoryRecoveryRateLimiter,
    // OD-13: the read-only agreement preview has its own budget (same limits), so
    // previewing does not consume the acceptance attempts of the same source.
    {
      provide: INVITATION_PREVIEW_LIMITER,
      useClass: InMemoryRecoveryRateLimiter,
    },
  ],
  controllers: [MerchantAccessController, CompanyMerchantInvitationController],
  exports: [MerchantAccessService, MerchantAccessGuard],
})
export class MerchantAccessModule {}
