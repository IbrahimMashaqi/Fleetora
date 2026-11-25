import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { ListWarehousesDto } from './dto/list-warehouses.dto.js';
import {
  WarehouseArchiveDto,
  WarehouseInputDto,
} from './dto/warehouse-input.dto.js';
import { WarehousesService } from './warehouses.service.js';

@ApiTags('warehouses')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('warehouses')
export class WarehousesController {
  constructor(
    @Inject(WarehousesService) private readonly warehouses: WarehousesService,
  ) {}

  // Writes carry the company the client believes it is acting for; a mismatch
  // means the session changed underneath an open page.
  private context(actor: TokenPayload, expected: string | undefined) {
    if (!expected || expected !== actor.orgId)
      throw new ForbiddenException('Session context changed');
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(
    @GetCurrentUser() actor: TokenPayload,
    @Query() query: ListWarehousesDto,
  ) {
    return this.warehouses.list(actor, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  details(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.warehouses.details(actor, id);
  }

  @Post()
  create(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: WarehouseInputDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    this.context(actor, expected);
    return this.warehouses.create(actor, input);
  }

  @Patch(':id')
  update(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: WarehouseInputDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    this.context(actor, expected);
    return this.warehouses.update(actor, id, input);
  }

  @Put(':id/archive')
  archive(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: WarehouseArchiveDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    this.context(actor, expected);
    return this.warehouses.setArchived(actor, id, input.archived);
  }
}
