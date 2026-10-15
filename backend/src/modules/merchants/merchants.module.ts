import { Module } from '@nestjs/common';
import { MerchantsController } from './merchants.controller.js';
import { MerchantsService } from './merchants.service.js';
import { MerchantsRepository } from './merchants.repository.js';

@Module({ controllers: [MerchantsController], providers: [MerchantsService, MerchantsRepository] })
export class MerchantsModule {}
