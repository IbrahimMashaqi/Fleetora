import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import {
  capabilities,
  company,
  CURRENCIES,
  TRANSITIONS,
} from './parcel-domain.js';
import { expectedCompany, parcelValidation } from './parcel-http.js';
import {
  AssignmentDto,
  AttemptDto,
  LocationDto,
  PageDto,
  ParcelEditDto,
  ParcelInputDto,
  TransitionDto,
} from './parcel.dto.js';
import { ParcelOperationsRepository } from './parcel-operations.repository.js';
@ApiTags('parcels')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@UsePipes(parcelValidation)
@Controller('parcels')
export class ParcelsController {
  constructor(
    @Inject(ParcelOperationsRepository)
    private readonly operations: ParcelOperationsRepository,
  ) {}
  @Get('config') @Header('Cache-Control', 'private, no-store') config(
    @GetCurrentUser() actor: TokenPayload,
  ) {
    return {
      companyId: company(actor),
      capabilities: capabilities(actor.role),
      transitions: TRANSITIONS,
      currencies: Object.keys(CURRENCIES),
      currencyPrecision: CURRENCIES,
    };
  }
  @Get('drivers') @Header('Cache-Control', 'private, no-store') drivers(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: PageDto,
  ) {
    return this.operations.drivers(actor, q);
  }
  @Get() @Header('Cache-Control', 'private, no-store') list(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: PageDto,
  ) {
    return this.operations.parcels(actor, q);
  }
  @Get(':id') @Header('Cache-Control', 'private, no-store') details(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.operations.details(actor, id);
  }
  @Get(':id/events') @Header('Cache-Control', 'private, no-store') events(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: PageDto,
  ) {
    return this.operations.events(actor, id, q);
  }
  @Post() create(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: ParcelInputDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.operations.saveParcel(actor, input);
  }
  @Patch(':id') edit(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ParcelEditDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.operations.saveParcel(actor, input, id);
  }
  @Post(':id/transition') transition(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: TransitionDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.operations.transition(actor, id, input);
  }
  @Post(':id/assignment') assignment(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: AssignmentDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.operations.assignment(actor, id, input);
  }
  @Post(':id/attempts') attempt(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: AttemptDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.operations.attempt(actor, id, input);
  }
  @Post(':id/location') location(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: LocationDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.operations.location(actor, id, input);
  }
}
