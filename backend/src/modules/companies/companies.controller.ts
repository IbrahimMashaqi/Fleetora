import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import { AllowCompanyStatus } from '../auth/decorators/company-status.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { InMemoryRecoveryRateLimiter } from '../auth/recovery-rate-limiter.js';
import {
  ClientSourceService,
  rateLimitSource,
  type ClientSourceRequest,
} from '../auth/client-source.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { expectedCompany } from '../parcels/parcel-http.js';
import {
  CompaniesService,
  companyInvitationHash,
} from './companies.service.js';
import {
  AcceptCompanyAdminDto,
  CompanyPageDto,
  CompanyProfileDto,
  CompanyTransitionDto,
  CreateCompanyDto,
} from './companies.dto.js';
import { CompanyBody, CompanyBodyGuard } from './company-body.guard.js';
const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
@Controller('platform/companies')
@UseGuards(AccessTokenGuard, CompanyBodyGuard)
@UsePipes(validation)
export class PlatformCompaniesController {
  constructor(
    @Inject(CompaniesService) private readonly companies: CompaniesService,
  ) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(
    @GetCurrentUser() actor: TokenPayload,
    @Query() query: CompanyPageDto,
  ) {
    return this.companies.list(actor, query);
  }
  @Get(':id') @Header('Cache-Control', 'private, no-store') details(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.companies.details(actor, id);
  }
  @CompanyBody(
    'name',
    'phone',
    'address',
    'currency',
    'adminName',
    'adminEmail',
  )
  @Post()
  @Header('Cache-Control', 'no-store')
  create(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: CreateCompanyDto,
  ) {
    return this.companies.create(actor, input);
  }
  @CompanyBody('action', 'reason', 'revision')
  @Post(':id/transitions')
  transition(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: CompanyTransitionDto,
  ) {
    return this.companies.transition(actor, id, input);
  }
  @Post(':id/admin-invitation') @Header('Cache-Control', 'no-store') invite(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.companies.reissue(actor, id);
  }
}
@Controller('company')
@UseGuards(AccessTokenGuard, CompanyBodyGuard)
@UsePipes(validation)
export class CompanyProfileController {
  constructor(
    @Inject(CompaniesService) private readonly companies: CompaniesService,
    @Inject(InMemoryRecoveryRateLimiter)
    private readonly limiter: InMemoryRecoveryRateLimiter,
    @Inject(ClientSourceService) private readonly source: ClientSourceService,
  ) {}
  @AllowCompanyStatus()
  @Get('status')
  @Header('Cache-Control', 'private, no-store')
  status(@GetCurrentUser() actor: TokenPayload) {
    return this.companies.self(actor);
  }
  @Get('profile') @Header('Cache-Control', 'private, no-store') profile(
    @GetCurrentUser() actor: TokenPayload,
  ) {
    return this.companies.self(actor, true);
  }
  @CompanyBody('name', 'phone', 'address', 'revision')
  @Patch('profile')
  save(
    @GetCurrentUser() actor: TokenPayload,
    @Headers('x-fleetora-company-context') expected: string | undefined,
    @Body() input: CompanyProfileDto,
  ) {
    expectedCompany(actor, expected);
    return this.companies.save(actor, input);
  }
  @CompanyBody('name', 'phone', 'address', 'revision')
  @AllowCompanyStatus()
  @Post('status/resubmit')
  resubmit(
    @GetCurrentUser() actor: TokenPayload,
    @Headers('x-fleetora-company-context') expected: string | undefined,
    @Body() input: CompanyProfileDto,
  ) {
    expectedCompany(actor, expected);
    return this.companies.save(actor, input, true);
  }
  @CompanyBody('token', 'name', 'password')
  @Public()
  @Post('admin-invitations/accept')
  @Header('Cache-Control', 'no-store')
  accept(
    @Body() input: AcceptCompanyAdminDto,
    @Req() request: ClientSourceRequest,
  ) {
    const limit = this.limiter.consume(
      rateLimitSource(this.source.resolve(request)),
      `company-admin:${companyInvitationHash(input.token)}`,
    );
    if (!limit.allowed)
      throw new HttpException(
        'Too many invitation attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    return this.companies.accept(input);
  }
}
