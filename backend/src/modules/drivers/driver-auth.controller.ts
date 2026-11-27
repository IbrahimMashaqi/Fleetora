import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DriverEndpoint } from '../auth/decorators/driver-endpoint.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { RefreshTokenGuard } from '../auth/guards/refresh-token.guard.js';
import { AuthService } from '../auth/auth.service.js';
import {
  ClientSourceService,
  rateLimitSource,
  type ClientSourceRequest,
} from '../auth/client-source.js';
import { InMemorySigninRateLimiter } from '../auth/signin-rate-limiter.js';
import { InMemoryRecoveryRateLimiter } from '../auth/recovery-rate-limiter.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import {
  AcceptDriverInvitationDto,
  DriverSigninDto,
} from './driver-identity.dto.js';
import { DriverAuthService } from './driver-auth.service.js';
import {
  DriverIdentityService,
  hashDriverToken,
} from './driver-identity.service.js';

@DriverEndpoint()
@Controller('driver')
export class DriverAuthController {
  constructor(
    @Inject(DriverAuthService) private readonly driver: DriverAuthService,
    @Inject(DriverIdentityService)
    private readonly invitations: DriverIdentityService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(InMemorySigninRateLimiter)
    private readonly signinLimiter: InMemorySigninRateLimiter,
    @Inject(InMemoryRecoveryRateLimiter)
    private readonly recoveryLimiter: InMemoryRecoveryRateLimiter,
    @Inject(ClientSourceService)
    private readonly clientSource: ClientSourceService,
  ) {}
  @Public()
  @Post('auth/signin')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async signin(
    @Body() input: DriverSigninDto,
    @Req() request: ClientSourceRequest,
  ) {
    const source = rateLimitSource(this.clientSource.resolve(request));
    const limit = this.signinLimiter.consume(source, input.phone);
    if (!limit.allowed)
      throw new HttpException(
        {
          message: 'Too many sign-in attempts',
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        429,
      );
    const session = await this.driver.signin(input.phone, input.password);
    this.signinLimiter.release(source, input.phone);
    return session;
  }
  @Public()
  @Post('invitations/accept')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  accept(
    @Body() input: AcceptDriverInvitationDto,
    @Req() request: ClientSourceRequest,
  ) {
    const source = rateLimitSource(this.clientSource.resolve(request));
    const limit = this.recoveryLimiter.consume(
      source,
      hashDriverToken(input.token),
    );
    if (!limit.allowed)
      throw new HttpException(
        {
          message: 'Too many activation attempts',
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        429,
      );
    return this.invitations.accept(input);
  }
  @UseGuards(AccessTokenGuard)
  @Get('auth/me')
  @Header('Cache-Control', 'no-store')
  me(@GetCurrentUser() actor: TokenPayload) {
    if (actor.role !== 'DRIVER')
      throw new ForbiddenException('Driver account required');
    return this.driver.me(actor);
  }
  @UseGuards(RefreshTokenGuard)
  @Post('auth/refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  refresh(@GetCurrentUser() actor: TokenPayload & { refreshToken: string }) {
    if (actor.role !== 'DRIVER')
      throw new ForbiddenException('Driver account required');
    return this.auth.refreshTokens(actor.sub, actor.refreshToken, true, actor.companyVersion);
  }
}
