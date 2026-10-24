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

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
  providers: [
    MerchantAccessRepository,
    MerchantAccessService,
    MerchantAccessGuard,
    InMemoryRecoveryRateLimiter,
  ],
  controllers: [MerchantAccessController, CompanyMerchantInvitationController],
  exports: [MerchantAccessService, MerchantAccessGuard],
})
export class MerchantAccessModule {}
