import { Module } from '@nestjs/common';
import { ParcelStore } from '../parcels/parcel-store.js';
import { MerchantPricingController } from './merchant-pricing.controller.js';
import { MerchantPricingRepository } from './merchant-pricing.repository.js';
import { MerchantPricingService } from './merchant-pricing.service.js';

@Module({
  controllers: [MerchantPricingController],
  providers: [ParcelStore, MerchantPricingRepository, MerchantPricingService],
  exports: [MerchantPricingService],
})
export class MerchantPricingModule {}
