import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { MerchantRequestsService } from './merchant-requests.service.js';
import {
  MerchantAmendmentDto,
  MerchantCancellationRequestDto,
  MerchantPageDto,
  ReviewMerchantRequestDto,
} from './merchant-portal.dto.js';
import { merchantValidation } from './merchant-portal.controller.js';
import { MerchantFinanceService } from './merchant-finance.service.js';
@UseGuards(AccessTokenGuard)
@UsePipes(merchantValidation)
@Controller('merchant/parcels')
export class MerchantParcelRequestsController {
  constructor(
    @Inject(MerchantRequestsService)
    private readonly requests: MerchantRequestsService,
  ) {}
  @Get(':id/requests') @Header('Cache-Control', 'private, no-store') list(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.requests.merchantList(actor, id);
  }
  @Post(':id/amendment-requests') amendment(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: MerchantAmendmentDto,
  ) {
    return this.requests.create(actor, id, input, 'AMEND');
  }
  @Post(':id/cancellation-requests') cancel(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: MerchantCancellationRequestDto,
  ) {
    return this.requests.create(actor, id, input, 'CANCEL');
  }
}
@UseGuards(AccessTokenGuard)
@UsePipes(merchantValidation)
@Controller('parcel-requests')
export class CompanyParcelRequestsController {
  constructor(
    @Inject(MerchantRequestsService)
    private readonly requests: MerchantRequestsService,
  ) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: MerchantPageDto,
  ) {
    return this.requests.list(actor, q);
  }
  @Get(':id') @Header('Cache-Control', 'private, no-store') preview(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.requests.preview(actor, id);
  }
  @Post(':id/review') review(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ReviewMerchantRequestDto,
  ) {
    return this.requests.review(actor, id, input);
  }
}
@UseGuards(AccessTokenGuard)
@UsePipes(merchantValidation)
@Controller('merchant-settlement-requests')
export class CompanySettlementRequestsController {
  constructor(
    @Inject(MerchantFinanceService)
    private readonly finance: MerchantFinanceService,
  ) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: MerchantPageDto,
  ) {
    return this.finance.companyRequests(actor, q);
  }
  @Post(':id/review') review(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.finance.reviewRequest(actor, id);
  }
}
