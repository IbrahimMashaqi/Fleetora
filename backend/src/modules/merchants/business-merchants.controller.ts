import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { ParcelOperationsRepository } from '../parcels/parcel-operations.repository.js';
import { ParcelFinanceRepository } from '../parcels/parcel-finance.repository.js';
import { expectedCompany, parcelValidation } from '../parcels/parcel-http.js';
import {
  MerchantEditDto,
  MerchantInputDto,
  PageDto,
} from '../parcels/parcel.dto.js';
@ApiTags('business-merchants')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@UsePipes(parcelValidation)
@Controller('merchants/business')
export class BusinessMerchantsController {
  constructor(
    @Inject(ParcelOperationsRepository)
    private readonly operations: ParcelOperationsRepository,
    @Inject(ParcelFinanceRepository)
    private readonly finance: ParcelFinanceRepository,
  ) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: PageDto,
  ) {
    return this.operations.merchants(actor, q);
  }
  @Get(':id') @Header('Cache-Control', 'private, no-store') details(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.operations.merchant(actor, id);
  }
  @Get(':id/statement') @Header('Cache-Control', 'private, no-store') statement(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: PageDto,
  ) {
    return this.finance.statement(actor, id, q);
  }
  @Post() create(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: MerchantInputDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.operations.saveMerchant(actor, input);
  }
  @Patch(':id') edit(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: MerchantEditDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.operations.saveMerchant(actor, input, id);
  }
}
