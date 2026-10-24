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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { ListDriversDto } from './dto/list-drivers.dto.js';
import { DriversService } from './drivers.service.js';

@ApiTags('drivers')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('drivers')
export class DriversController {
  constructor(
    @Inject(DriversService) private readonly drivers: DriversService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@GetCurrentUser() actor: TokenPayload, @Query() query: ListDriversDto) {
    return this.drivers.list(actor, query);
  }

  @Put(':id/vehicle')
  async assign(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: AssignmentDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    if (!expected || expected !== actor.orgId)
      throw new ForbiddenException('Session context changed');
    return this.drivers.assign(actor, id, input);
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
