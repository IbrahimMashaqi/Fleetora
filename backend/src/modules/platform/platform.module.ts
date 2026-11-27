import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PlatformRepository } from './platform.repository.js';
import { PlatformService } from './platform.service.js';
import { PlatformController } from './platform.controller.js';
@Module({
  imports: [AuthModule],
  controllers: [PlatformController],
  providers: [PlatformRepository, PlatformService],
  exports: [PlatformService],
})
export class PlatformModule {}
