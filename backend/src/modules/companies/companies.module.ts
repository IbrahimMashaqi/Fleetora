import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PlatformModule } from '../platform/platform.module.js';
import { FleetRealtimeModule } from '../fleet/fleet-realtime.module.js';
import { CompaniesRepository } from './companies.repository.js';
import { CompaniesService } from './companies.service.js';
import {
  CompanyProfileController,
  PlatformCompaniesController,
} from './companies.controller.js';
@Module({
  imports: [AuthModule, PlatformModule, FleetRealtimeModule],
  controllers: [CompanyProfileController, PlatformCompaniesController],
  providers: [CompaniesRepository, CompaniesService],
})
export class CompaniesModule {}
