import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PlatformService, hashPlatformToken } from './platform.service.js';
import {
  AcceptPlatformInvitationDto,
  PlatformInvitationDto,
  PlatformMemberDto,
} from './platform.dto.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { InMemoryRecoveryRateLimiter } from '../auth/recovery-rate-limiter.js';
import {
  ClientSourceService,
  rateLimitSource,
  type ClientSourceRequest,
} from '../auth/client-source.js';
@Controller('platform')
@UseGuards(AccessTokenGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class PlatformController {
  constructor(
    @Inject(PlatformService) private readonly platform: PlatformService,
    @Inject(InMemoryRecoveryRateLimiter)
    private readonly limiter: InMemoryRecoveryRateLimiter,
    @Inject(ClientSourceService) private readonly source: ClientSourceService,
  ) {}
  @Get('me') @Header('Cache-Control', 'private, no-store') me(
    @GetCurrentUser() actor: TokenPayload,
  ) {
    return this.platform.me(actor);
  }
  @Get('staff') @Header('Cache-Control', 'private, no-store') staff(
    @GetCurrentUser() actor: TokenPayload,
  ) {
    return this.platform.overview(actor);
  }
  @Get('audit') @Header('Cache-Control', 'private, no-store') audit(
    @GetCurrentUser() actor: TokenPayload,
  ) {
    return this.platform.audit(actor);
  }
  @Post('invitations') @Header('Cache-Control', 'no-store') invite(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: PlatformInvitationDto,
  ) {
    return this.platform.issue(actor, input);
  }
  @Delete('invitations/:id') revoke(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.platform.revoke(actor, id);
  }
  @Patch('staff/:id') update(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: PlatformMemberDto,
  ) {
    return this.platform.update(actor, id, input);
  }
  @Public()
  @Post('invitations/accept')
  @Header('Cache-Control', 'no-store')
  accept(
    @Body() input: AcceptPlatformInvitationDto,
    @Req() request: ClientSourceRequest,
  ) {
    const result = this.limiter.consume(
      rateLimitSource(this.source.resolve(request)),
      `platform-invitation:${hashPlatformToken(input.token)}`,
    );
    if (!result.allowed)
      throw new HttpException(
        'Too many invitation attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    return this.platform.accept(input);
  }
}
