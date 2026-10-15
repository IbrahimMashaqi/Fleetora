import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { ListMerchantsDto } from './dto/list-merchants.dto.js';
import { MerchantsService } from './merchants.service.js';

@ApiTags('merchants')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('merchants')
export class MerchantsController {
  constructor(@Inject(MerchantsService) private readonly merchants: MerchantsService) {}

  @Get()
  list(@GetCurrentUser() actor: TokenPayload, @Query() query: ListMerchantsDto) {
    return this.merchants.list(actor, query);
  }

  @Get(':id')
  details(@GetCurrentUser() actor: TokenPayload, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.merchants.details(actor, id);
  }
}
