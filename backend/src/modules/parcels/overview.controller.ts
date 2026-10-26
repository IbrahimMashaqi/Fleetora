import { Controller, Get, Header, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { OverviewRepository } from './overview.repository.js';
import type { OverviewResponse } from './overview.types.js';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('dashboard')
export class OverviewController {
  constructor(@Inject(OverviewRepository) private readonly overview: OverviewRepository) {}

  @Get('overview')
  @Header('Cache-Control', 'private, no-store')
  getOverview(@GetCurrentUser() actor: TokenPayload): Promise<OverviewResponse> {
    return this.overview.getOverview(actor);
  }
}
