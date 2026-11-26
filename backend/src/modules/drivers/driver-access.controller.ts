import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { DriverIdentityService } from './driver-identity.service.js';
import { DriverOffboardingDto } from './driver-identity.dto.js';

@UseGuards(AccessTokenGuard)
@Controller('drivers/:id')
export class DriverAccessController {
  constructor(
    @Inject(DriverIdentityService)
    private readonly drivers: DriverIdentityService,
  ) {}
  private context(actor: TokenPayload, expected: string | undefined) {
    if (!expected || expected !== actor.orgId)
      throw new ForbiddenException('Session context changed');
  }
  @Get('access')
  @Header('Cache-Control', 'private, no-store')
  overview(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.drivers.overview(actor, id);
  }
  @Post('invitations')
  @Header('Cache-Control', 'no-store')
  issue(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    this.context(actor, expected);
    return this.drivers.issue(actor, id);
  }
  @Delete('invitations')
  revokeInvitation(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    this.context(actor, expected);
    return this.drivers.revokeInvitation(actor, id);
  }
  @Delete('access')
  revokeAccess(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    this.context(actor, expected);
    return this.drivers.revokeAccess(actor, id);
  }
  @Post('offboarding')
  offboard(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: DriverOffboardingDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    this.context(actor, expected);
    return this.drivers.offboard(actor, id, input.revokeAccess);
  }
}
