import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PersistedDriverIdentityVerifier } from './driver-identity.verifier.js';
import { FleetRealtimeModule } from './fleet-realtime.module.js';
import { FleetController, HeadquartersController } from './fleet.controller.js';
import { FleetRepository } from './fleet.repository.js';
import {
  DRIVER_IDENTITY_VERIFIER,
  DriverTelemetryService,
} from './driver-telemetry.service.js';
@Module({
  imports: [FleetRealtimeModule, AuthModule],
  controllers: [FleetController, HeadquartersController],
  providers: [
    FleetRepository,
    DriverTelemetryService,
    {
      provide: DRIVER_IDENTITY_VERIFIER,
      useClass: PersistedDriverIdentityVerifier,
    },
  ],
  exports: [DriverTelemetryService],
})
export class FleetModule {}
