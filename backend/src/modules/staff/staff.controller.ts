import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { InMemoryRecoveryRateLimiter } from '../auth/recovery-rate-limiter.js';
import {
  ClientSourceService,
  rateLimitSource,
  type ClientSourceRequest,
} from '../auth/client-source.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import {
  AcceptStaffInvitationDto,
  StaffInvitationDto,
} from './staff.dto.js';
import { StaffService, hashStaffToken } from './staff.service.js';

@ApiTags('staff')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('company/staff')
export class StaffController {
  constructor(
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(InMemoryRecoveryRateLimiter)
    private readonly limiter: InMemoryRecoveryRateLimiter,
    @Inject(ClientSourceService)
    private readonly clientSource: ClientSourceService,
  ) {}

  // Writes carry the company the client believes it is acting for; a mismatch
  // means the session changed underneath an open page.
  private context(actor: TokenPayload, expected: string | undefined) {
    if (!expected || expected !== actor.orgId)
      throw new ForbiddenException('Session context changed');
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  overview(@GetCurrentUser() actor: TokenPayload) {
    return this.staff.overview(actor);
  }

  @Post('invitations')
  @Header('Cache-Control', 'no-store')
  issue(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: StaffInvitationDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    this.context(actor, expected);
    return this.staff.issue(actor, input);
  }

  @Delete('invitations/:id')
  revoke(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    this.context(actor, expected);
    return this.staff.revoke(actor, id);
  }

  @Public()
  @Post('invitations/accept')
  @Header('Cache-Control', 'no-store')
  accept(
    @Body() input: AcceptStaffInvitationDto,
    @Req() request: ClientSourceRequest,
  ) {
    // Web acceptances arrive through the frontend server; only a signed client
    // source names the real caller, otherwise the per-token limit alone applies.
    const limit = this.limiter.consume(
      rateLimitSource(this.clientSource.resolve(request)),
      `staff-invitation:${hashStaffToken(input.token)}`,
    );
    if (!limit.allowed)
      throw new HttpException(
        {
          message: 'Too many invitation attempts. Try again later.',
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    return this.staff.accept(input);
  }
}
