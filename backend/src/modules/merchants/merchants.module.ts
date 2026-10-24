import { Module } from '@nestjs/common';
import { MerchantsController } from './merchants.controller.js';
import { MerchantsService } from './merchants.service.js';
import { MerchantsRepository } from './merchants.repository.js';
import { BusinessMerchantsController } from './business-merchants.controller.js';
import { ParcelsModule } from '../parcels/parcels.module.js';

@Module({
  imports: [ParcelsModule],
  controllers: [BusinessMerchantsController, MerchantsController],
  providers: [MerchantsService, MerchantsRepository],
})
export class MerchantsModule {}
