import {
  Controller,
  Get,
  Header,
  Inject,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { DashboardQueryDto } from './parcel.dto.js';
import { parcelValidation } from './parcel-http.js';
import { ParcelDashboardRepository } from './parcel-dashboard.repository.js';
@ApiTags('parcel-operations')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@UsePipes(parcelValidation)
@Controller('parcel-operations')
export class ParcelDashboardController {
  constructor(
    @Inject(ParcelDashboardRepository)
    private readonly dashboardService: ParcelDashboardRepository,
  ) {}
  @Get('dashboard') @Header('Cache-Control', 'private, no-store') dashboard(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: DashboardQueryDto,
  ) {
    return this.dashboardService.dashboard(actor, q);
  }
}
