import { AssignmentDto } from '../vehicles/vehicles.dto.js';
import {
  Body,
  Headers,
  ForbiddenException,
  Put,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { ListDriversDto } from './dto/list-drivers.dto.js';
import { DriverInputDto, DriverPhoneCheckDto, DriverSuspensionDto } from './dto/driver-input.dto.js';
import { DriversService } from './drivers.service.js';

@ApiTags('drivers')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('drivers')
export class DriversController {
  constructor(
    @Inject(DriversService) private readonly drivers: DriversService,
  ) {}

  private context(actor: TokenPayload, expected: string | undefined) {
    if (!expected || expected !== actor.orgId)
      throw new ForbiddenException('Session context changed');
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@GetCurrentUser() actor: TokenPayload, @Query() query: ListDriversDto) {
    return this.drivers.list(actor, query);
  }

  @Get('phone-check')
  @Header('Cache-Control', 'private, no-store')
  checkPhone(
    @GetCurrentUser() actor: TokenPayload,
    @Query() query: DriverPhoneCheckDto,
  ) {
    return this.drivers.checkPhone(actor, query.phone, query.excludeId);
  }

  @Put(':id/vehicle')
  async assign(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: AssignmentDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    this.context(actor, expected);
    return this.drivers.assign(actor, id, input);
  }

  @Post()
  create(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: DriverInputDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    this.context(actor, expected);
    return this.drivers.create(actor, input);
  }

  @Patch(':id')
  update(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: DriverInputDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    this.context(actor, expected);
    return this.drivers.update(actor, id, input);
  }

  @Put(':id/suspension')
  suspension(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: DriverSuspensionDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    this.context(actor, expected);
    return this.drivers.setSuspended(actor, id, input.suspended, input.reason);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  details(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.drivers.details(actor, id);
  }
}
