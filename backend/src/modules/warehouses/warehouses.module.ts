import { Module } from '@nestjs/common';
import { WarehousesController } from './warehouses.controller.js';
import { WarehousesRepository } from './warehouses.repository.js';
import { WarehousesService } from './warehouses.service.js';

@Module({
  controllers: [WarehousesController],
  providers: [WarehousesService, WarehousesRepository],
})
export class WarehousesModule {}
