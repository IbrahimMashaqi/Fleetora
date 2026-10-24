import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { expectedCompany, parcelValidation } from './parcel-http.js';
import {
  AdjustmentDto,
  CollectionDto,
  MethodDto,
  PageDto,
  PaymentDto,
  PreviewDto,
  ReversalDto,
  SettlementActionDto,
  SettlementCancelDto,
  SettlementCreateDto,
} from './parcel.dto.js';
import { ParcelFinanceRepository } from './parcel-finance.repository.js';
@ApiTags('parcel-collections')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@UsePipes(parcelValidation)
@Controller('collections')
export class CollectionsController {
  constructor(
    @Inject(ParcelFinanceRepository)
    private readonly finance: ParcelFinanceRepository,
  ) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: PageDto,
  ) {
    return this.finance.collections(actor, q);
  }
  @Post() create(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: CollectionDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.finance.collect(actor, input);
  }
  @Post(':id/remittance') remit(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: MethodDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.finance.remit(actor, id, input);
  }
}
@ApiTags('parcel-finance')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@UsePipes(parcelValidation)
@Controller('financial')
export class FinancialController {
  constructor(
    @Inject(ParcelFinanceRepository)
    private readonly finance: ParcelFinanceRepository,
  ) {}
  @Post('adjustments') adjustment(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: AdjustmentDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.finance.adjustment(actor, input);
  }
  @Post('adjustments/:id/reversal') reversal(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ReversalDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.finance.reversal(actor, id, input);
  }
}
@ApiTags('merchant-settlements')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@UsePipes(parcelValidation)
@Controller('settlements')
export class SettlementsController {
  constructor(
    @Inject(ParcelFinanceRepository)
    private readonly finance: ParcelFinanceRepository,
  ) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: PageDto,
  ) {
    return this.finance.settlements(actor, q);
  }
  @Get(':id') @Header('Cache-Control', 'private, no-store') details(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.finance.settlement(actor, id);
  }
  @Post('preview') preview(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: PreviewDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.finance.preview(actor, input);
  }
  @Post() draft(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: SettlementCreateDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.finance.draft(actor, input);
  }
  @Post(':id/finalize') finalize(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: SettlementActionDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.finance.finalize(actor, id, input);
  }
  @Post(':id/cancel') cancel(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: SettlementCancelDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.finance.cancel(actor, id, input);
  }
  @Post(':id/payment') pay(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: PaymentDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.finance.pay(actor, id, input);
  }
}
