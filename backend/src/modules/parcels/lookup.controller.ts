import {
  Controller,
  Get,
  Header,
  Inject,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { parcelValidation } from './parcel-http.js';
import { LookupDto } from './lookup.dto.js';
import { LookupRepository } from './lookup.repository.js';

@Controller('operation-lookups')
@UseGuards(AccessTokenGuard)
@UsePipes(parcelValidation)
export class LookupController {
  constructor(
    @Inject(LookupRepository) private readonly lookups: LookupRepository,
  ) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  search(@GetCurrentUser() actor: TokenPayload, @Query() query: LookupDto) {
    return this.lookups.search(actor, query);
  }
}
