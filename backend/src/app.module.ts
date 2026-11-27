import { VehiclesModule } from './modules/vehicles/vehicles.module.js';
import { FleetModule } from './modules/fleet/fleet.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DriversModule } from './modules/drivers/drivers.module.js';
import { DriverIdentityModule } from './modules/drivers/driver-identity.module.js';
import { WarehousesModule } from './modules/warehouses/warehouses.module.js';
import { MerchantsModule } from './modules/merchants/merchants.module.js';
import { MerchantPortalModule } from './modules/merchant-portal/merchant-portal.module.js';
import { StaffModule } from './modules/staff/staff.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    MailModule,
    AuthModule,
    MerchantsModule,
    DriversModule,
    DriverIdentityModule,
    VehiclesModule,
    WarehousesModule,
    FleetModule,
    MerchantPortalModule,
    StaffModule,
    PlatformModule,
  ],
})
export class AppModule {}
