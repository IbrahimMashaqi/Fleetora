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
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { InMemoryRecoveryRateLimiter } from '../auth/recovery-rate-limiter.js';
import {
  AcceptMerchantInvitationDto,
  CompanyMerchantInvitationDto,
  MerchantInvitationDto,
  UpdateMerchantEmployeeDto,
} from './merchant-access.dto.js';
import { MerchantAccessService } from './merchant-access.service.js';
import { MerchantAccessGuard } from './merchant-access.guard.js';
import type { MerchantIdentity } from './merchant-access.types.js';

@ApiTags('merchant-access')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, MerchantAccessGuard)
@Controller('merchant')
export class MerchantAccessController {
  constructor(
    @Inject(MerchantAccessService)
    private readonly access: MerchantAccessService,
    @Inject(InMemoryRecoveryRateLimiter)
    private readonly limiter: InMemoryRecoveryRateLimiter,
  ) {}

  @Get('me')
  me(@GetCurrentUser() actor: MerchantIdentity) {
    return this.access.me(actor);
  }

  @Get('employees')
  employees(@GetCurrentUser() actor: MerchantIdentity) {
    return this.access.employees(actor);
  }

  @Get('activity')
  activity(@GetCurrentUser() actor: MerchantIdentity) {
    return this.access.activity(actor);
  }

  @Patch('employees/:id')
  updateEmployee(
    @GetCurrentUser() actor: MerchantIdentity,
    @Param('id') id: string,
    @Body() input: UpdateMerchantEmployeeDto,
  ) {
    return this.access.updateEmployee(actor, id, input);
  }

  @Get('invitations')
  invitations(@GetCurrentUser() actor: MerchantIdentity) {
    return this.access.invitations(actor);
  }

  @Post('invitations')
  @Header('Cache-Control', 'no-store')
  issue(
    @GetCurrentUser() actor: MerchantIdentity,
    @Body() input: MerchantInvitationDto,
  ) {
    return this.access.issueByOwner(actor, input);
  }

  @Delete('invitations/:id')
  revoke(@GetCurrentUser() actor: MerchantIdentity, @Param('id') id: string) {
    return this.access.revoke(actor, id);
  }

  @Public()
  @Post('invitations/accept')
  @Header('Cache-Control', 'no-store')
  accept(
    @Body() input: AcceptMerchantInvitationDto,
    @Req() request: Pick<Request, 'ip'>,
  ) {
    const limit = this.limiter.consume(
      request.ip ?? 'unknown',
      `merchant-invitation:${createHash('sha256').update(input.token).digest('hex')}`,
    );
    if (!limit.allowed)
      throw new HttpException(
        {
          message: 'Too many invitation attempts. Try again later.',
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    return this.access.accept(input);
  }
}

@ApiTags('merchant-invitations')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('operations/merchants/:merchantId/invitations')
export class CompanyMerchantInvitationController {
  constructor(
    @Inject(MerchantAccessService)
    private readonly access: MerchantAccessService,
  ) {}

  @Get()
  invitations(
    @GetCurrentUser() actor: MerchantIdentity,
    @Param('merchantId') merchantId: string,
  ) {
    return this.access.invitations(actor, merchantId);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  issue(
    @GetCurrentUser() actor: MerchantIdentity,
    @Param('merchantId') merchantId: string,
    @Body() input: CompanyMerchantInvitationDto,
  ) {
    return this.access.issueByAdmin(actor, merchantId, input);
  }

  @Delete(':id')
  revoke(
    @GetCurrentUser() actor: MerchantIdentity,
    @Param('merchantId') merchantId: string,
    @Param('id') id: string,
  ) {
    return this.access.revoke(actor, id, merchantId);
  }
}
