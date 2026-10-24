import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { parcelValidation } from '../parcels/parcel-http.js';
import {
  AssignMerchantPlanDto,
  PlanEditDto,
  PlanInputDto,
  PricingPageDto,
  PricingPreviewDto,
  TariffInputDto,
  ZoneEditDto,
  ZoneInputDto,
} from './merchant-pricing.dto.js';
import { MerchantPricingService } from './merchant-pricing.service.js';

@ApiTags('merchant-pricing')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@UsePipes(parcelValidation)
@Controller('merchant-pricing')
export class MerchantPricingController {
  constructor(
    @Inject(MerchantPricingService)
    private readonly pricing: MerchantPricingService,
  ) {}
  @Get('zones') @Header('Cache-Control', 'private, no-store') zones(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: PricingPageDto,
  ) {
    return this.pricing.zones(actor, q);
  }
  @Post('zones') createZone(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: ZoneInputDto,
  ) {
    return this.pricing.saveZone(actor, input);
  }
  @Patch('zones/:id') updateZone(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ZoneEditDto,
  ) {
    return this.pricing.saveZone(actor, input, id);
  }
  @Get('plans') @Header('Cache-Control', 'private, no-store') plans(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: PricingPageDto,
  ) {
    return this.pricing.plans(actor, q);
  }
  @Get('plans/:id') @Header('Cache-Control', 'private, no-store') plan(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.pricing.planDetails(actor, id);
  }
  @Post('plans') createPlan(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: PlanInputDto,
  ) {
    return this.pricing.savePlan(actor, input);
  }
  @Patch('plans/:id') updatePlan(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: PlanEditDto,
  ) {
    return this.pricing.savePlan(actor, input, id);
  }
  @Put('plans/:id/tariffs/:zoneId') tariff(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('zoneId', new ParseUUIDPipe()) zoneId: string,
    @Body() input: TariffInputDto,
  ) {
    return this.pricing.saveTariff(actor, id, zoneId, input);
  }
  @Put('merchants/:id/plan') assignment(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: AssignMerchantPlanDto,
  ) {
    return this.pricing.assignPlan(actor, id, input);
  }
  @Post('preview') @Header('Cache-Control', 'private, no-store') preview(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: PricingPreviewDto,
  ) {
    return this.pricing.preview(actor, input);
  }
}
