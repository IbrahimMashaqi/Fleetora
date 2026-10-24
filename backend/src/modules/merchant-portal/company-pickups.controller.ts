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
import { MerchantPickupsService } from './merchant-pickups.service.js';
import { merchantValidation } from './merchant-portal.controller.js';
import {
  MerchantPageDto,
  PickupReceiptDto,
  PickupReviewDto,
} from './merchant-portal.dto.js';
@UseGuards(AccessTokenGuard)
@UsePipes(merchantValidation)
@Controller('pickups')
export class CompanyPickupsController {
  constructor(
    @Inject(MerchantPickupsService)
    private readonly pickups: MerchantPickupsService,
  ) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: MerchantPageDto,
  ) {
    return this.pickups.companyList(actor, q);
  }
  @Get(':id') @Header('Cache-Control', 'private, no-store') details(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.pickups.companyDetails(actor, id);
  }
  @Post(':id/review') review(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: PickupReviewDto,
  ) {
    return this.pickups.review(actor, id, input);
  }
  @Post(':id/receipts') receipts(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: PickupReceiptDto,
  ) {
    return this.pickups.receive(actor, id, input);
  }
}
