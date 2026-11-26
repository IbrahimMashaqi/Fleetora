import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DriverAuthController } from './driver-auth.controller.js';
import { DriverAccessController } from './driver-access.controller.js';
import { DriverIdentityRepository } from './driver-identity.repository.js';
import { DriverIdentityService } from './driver-identity.service.js';
import { DriverAuthService } from './driver-auth.service.js';
@Module({
  imports: [AuthModule],
  controllers: [DriverAuthController, DriverAccessController],
  providers: [
    DriverIdentityRepository,
    DriverIdentityService,
    DriverAuthService,
  ],
})
export class DriverIdentityModule {}
