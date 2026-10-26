import { Module } from '@nestjs/common';
import { ParcelStore } from './parcel-store.js';
import { ParcelLedger } from './parcel-ledger.js';
import { ParcelOperationsRepository } from './parcel-operations.repository.js';
import { ParcelFinanceRepository } from './parcel-finance.repository.js';
import { ParcelDashboardRepository } from './parcel-dashboard.repository.js';
import { ParcelsController } from './parcels.controller.js';
import { ReturnsController } from './returns.controller.js';
import {
  CollectionsController,
  FinancialController,
  SettlementsController,
} from './parcel-finance.controller.js';
import { ParcelDashboardController } from './parcel-dashboard.controller.js';
import { OverviewController } from './overview.controller.js';
import { OverviewRepository } from './overview.repository.js';
@Module({
  controllers: [
    ParcelsController,
    ReturnsController,
    CollectionsController,
    FinancialController,
    SettlementsController,
    ParcelDashboardController,
    OverviewController,
  ],
  providers: [
    ParcelStore,
    ParcelLedger,
    ParcelOperationsRepository,
    ParcelFinanceRepository,
    ParcelDashboardRepository,
    OverviewRepository,
  ],
  exports: [ParcelOperationsRepository, ParcelFinanceRepository],
})
export class ParcelsModule {}
