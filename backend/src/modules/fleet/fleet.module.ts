import { Module } from '@nestjs/common';
import { FleetRealtimeModule } from './fleet-realtime.module.js';
import { FleetController, HeadquartersController } from './fleet.controller.js';
import { FleetRepository } from './fleet.repository.js';
import {
  DRIVER_IDENTITY_VERIFIER,
  DriverTelemetryService,
  UnconfiguredDriverIdentityVerifier,
} from './driver-telemetry.service.js';
@Module({
  imports: [FleetRealtimeModule],
  controllers: [FleetController, HeadquartersController],
  providers: [
    FleetRepository,
    DriverTelemetryService,
    {
      provide: DRIVER_IDENTITY_VERIFIER,
      useClass: UnconfiguredDriverIdentityVerifier,
    },
  ],
  exports: [DriverTelemetryService],
})
export class FleetModule {}
