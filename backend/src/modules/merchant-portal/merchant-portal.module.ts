import { Module } from '@nestjs/common';
import { MerchantAccessModule } from '../merchant-access/merchant-access.module.js';
import { MerchantPricingModule } from '../merchant-pricing/merchant-pricing.module.js';
import { MerchantPortalStore } from './merchant-portal.store.js';
import { MerchantParcelsRepository } from './merchant-parcels.repository.js';
import { MerchantParcelsService } from './merchant-parcels.service.js';
import { MerchantPickupsService } from './merchant-pickups.service.js';
import { MerchantImportsService } from './merchant-imports.service.js';
import { MerchantFinanceService } from './merchant-finance.service.js';
import { MerchantPortalController } from './merchant-portal.controller.js';
import { CompanyPickupsController } from './company-pickups.controller.js';
import { ParcelStore } from '../parcels/parcel-store.js';
import { ParcelLedger } from '../parcels/parcel-ledger.js';
import { ParcelsModule } from '../parcels/parcels.module.js';
import { MerchantRequestsService } from './merchant-requests.service.js';
import {
  MerchantParcelRequestsController,
  CompanyParcelRequestsController,
  CompanySettlementRequestsController,
} from './merchant-requests.controller.js';
@Module({
  imports: [MerchantAccessModule, MerchantPricingModule, ParcelsModule],
  providers: [
    MerchantPortalStore,
    MerchantParcelsRepository,
    MerchantParcelsService,
    MerchantPickupsService,
    MerchantImportsService,
    MerchantFinanceService,
    MerchantRequestsService,
    ParcelStore,
    ParcelLedger,
  ],
  controllers: [
    MerchantPortalController,
    CompanyPickupsController,
    MerchantParcelRequestsController,
    CompanyParcelRequestsController,
    CompanySettlementRequestsController,
  ],
  exports: [
    MerchantPortalStore,
    MerchantParcelsService,
    MerchantPickupsService,
    MerchantImportsService,
    MerchantFinanceService,
  ],
})
export class MerchantPortalModule {}
