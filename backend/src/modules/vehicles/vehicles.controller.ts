import {
  Body,
  Headers,
  ForbiddenException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { VehicleInputDto, VehicleQueryDto } from './vehicles.dto.js';
import { VehiclesService } from './vehicles.service.js';
@UseGuards(AccessTokenGuard)
@Controller('vehicles')
export class VehiclesController {
  private context(actor: TokenPayload, expected: string | undefined) {
    if (!expected || expected !== actor.orgId)
      throw new ForbiddenException('Session context changed');
  }
  constructor(
    @Inject(VehiclesService) private readonly vehicles: VehiclesService,
  ) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(
    @GetCurrentUser() actor: TokenPayload,
    @Query() query: VehicleQueryDto,
  ) {
    return this.vehicles.list(actor, query);
  }
  @Get(':id') @Header('Cache-Control', 'private, no-store') details(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.vehicles.details(actor, id);
  }
  @Post() create(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: VehicleInputDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    this.context(actor, expected);
    return this.vehicles.save(actor, input);
  }
  @Patch(':id') edit(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: VehicleInputDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    this.context(actor, expected);
    return this.vehicles.save(actor, input, id);
  }
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ): Promise<void> {
    this.context(actor, expected);
    await this.vehicles.remove(actor, id);
  }
}
