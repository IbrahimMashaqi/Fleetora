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
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { MerchantParcelsService } from './merchant-parcels.service.js';
import { MerchantPickupsService } from './merchant-pickups.service.js';
import { MerchantImportsService } from './merchant-imports.service.js';
import { MerchantFinanceService } from './merchant-finance.service.js';
import {
  ImportFileDto,
  MerchantCancelDto,
  MerchantPageDto,
  MerchantParcelDto,
  MerchantParcelEditDto,
  MerchantPickupActionDto,
  MerchantPreviewDto,
  PickupCreateDto,
  RequestKeyDto,
  SettlementRequestDto,
} from './merchant-portal.dto.js';
export const merchantValidation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
@ApiTags('merchant mobile')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@UsePipes(merchantValidation)
@Controller('merchant')
export class MerchantPortalController {
  constructor(
    @Inject(MerchantParcelsService)
    private readonly parcels: MerchantParcelsService,
    @Inject(MerchantPickupsService)
    private readonly pickups: MerchantPickupsService,
    @Inject(MerchantImportsService)
    private readonly imports: MerchantImportsService,
    @Inject(MerchantFinanceService)
    private readonly finance: MerchantFinanceService,
  ) {}
  @Get('zones') @Header('Cache-Control', 'private, no-store') zones(
    @GetCurrentUser() actor: TokenPayload,
  ) {
    return this.parcels.zones(actor);
  }
  @Post('pricing-preview') preview(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: MerchantPreviewDto,
  ) {
    return this.parcels.preview(actor, input);
  }
  @Get('parcels') @Header('Cache-Control', 'private, no-store') list(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: MerchantPageDto,
  ) {
    return this.parcels.list(actor, q);
  }
  @Post('parcels') create(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: MerchantParcelDto,
  ) {
    return this.parcels.create(actor, input);
  }
  @Get('parcels/:id/label') @Header('Cache-Control', 'private, no-store') label(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.parcels.label(actor, id);
  }
  @Get('parcels/:id') @Header('Cache-Control', 'private, no-store') details(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.parcels.details(actor, id);
  }
  @Patch('parcels/:id') edit(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: MerchantParcelEditDto,
  ) {
    return this.parcels.edit(actor, id, input);
  }
  @Post('parcels/:id/cancel') cancel(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: MerchantCancelDto,
  ) {
    return this.parcels.cancel(actor, id, input);
  }
  @Get('pickups') @Header('Cache-Control', 'private, no-store') pickupList(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: MerchantPageDto,
  ) {
    return this.pickups.list(actor, q);
  }
  @Post('pickups') pickupCreate(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: PickupCreateDto,
  ) {
    return this.pickups.create(actor, input);
  }
  @Get('pickups/:id')
  @Header('Cache-Control', 'private, no-store')
  pickupDetails(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.pickups.details(actor, id);
  }
  @Post('pickups/:id/action') pickupAction(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: MerchantPickupActionDto,
  ) {
    return this.pickups.merchantAction(actor, id, input);
  }
  @Get('imports/template')
  @Header('Cache-Control', 'private, no-store')
  template(@GetCurrentUser() actor: TokenPayload) {
    return this.imports.template(actor);
  }
  @Post('imports/preview') importPreview(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: ImportFileDto,
  ) {
    return this.imports.preview(actor, input.fileBase64);
  }
  @Post('imports/:id/confirm') importConfirm(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: RequestKeyDto,
  ) {
    return this.imports.confirm(actor, id, input.idempotencyKey);
  }
  @Get('statement') @Header('Cache-Control', 'private, no-store') statement(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: MerchantPageDto,
  ) {
    return this.finance.statement(actor, q);
  }
  @Get('settlement-requests')
  @Header('Cache-Control', 'private, no-store')
  settlementRequests(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: MerchantPageDto,
  ) {
    return this.finance.settlementRequests(actor, q);
  }
  @Post('settlement-requests') requestSettlement(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: SettlementRequestDto,
  ) {
    return this.finance.requestSettlement(actor, input);
  }
}
