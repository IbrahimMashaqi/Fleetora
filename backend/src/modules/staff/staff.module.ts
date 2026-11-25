import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InMemoryRecoveryRateLimiter } from '../auth/recovery-rate-limiter.js';
import { ClientSourceService } from '../auth/client-source.js';
import { StaffController } from './staff.controller.js';
import { StaffRepository } from './staff.repository.js';
import { StaffService } from './staff.service.js';

@Module({
  imports: [ConfigModule],
  controllers: [StaffController],
  providers: [
    StaffService,
    StaffRepository,
    InMemoryRecoveryRateLimiter,
    ClientSourceService,
  ],
})
export class StaffModule {}
