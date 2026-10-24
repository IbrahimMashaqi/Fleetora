import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { FleetEvents } from './fleet-events.js';
import { FleetGateway } from './fleet.gateway.js';
import { FleetTicketsService } from './fleet-tickets.service.js';

@Module({
  imports: [AuthModule, ConfigModule],
  providers: [FleetEvents, FleetTicketsService, FleetGateway],
  exports: [FleetEvents, FleetTicketsService],
})
export class FleetRealtimeModule {}
