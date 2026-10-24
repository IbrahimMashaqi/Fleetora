import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { HeadquartersInput } from './fleet.dto.js';
import { FleetRepository, companyAdmin } from './fleet.repository.js';
import { FleetEvents } from './fleet-events.js';
import { FleetTicketsService } from './fleet-tickets.service.js';

@UseGuards(AccessTokenGuard)
@Controller('companies/me/headquarters')
export class HeadquartersController {
  constructor(
    @Inject(FleetRepository) private readonly repository: FleetRepository,
    @Inject(FleetEvents) private readonly events: FleetEvents,
  ) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  get(@GetCurrentUser() actor: TokenPayload) {
    return this.repository.headquarters(actor);
  }
  @Patch()
  @Header('Cache-Control', 'private, no-store')
  async save(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: HeadquartersInput,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    const companyId = companyAdmin(actor);
    if (!expected || expected !== companyId)
      throw new ForbiddenException('Session context changed');
    const result = await this.repository.saveHeadquarters(actor, input);
    this.events.publish({ name: 'fleet:headquarters-updated', data: result });
    return result;
  }
}
@UseGuards(AccessTokenGuard)
@Controller('fleet')
export class FleetController {
  constructor(
    @Inject(FleetRepository) private readonly repository: FleetRepository,
    @Inject(FleetTicketsService) private readonly tickets: FleetTicketsService,
  ) {}
  @Get('locations')
  @Header('Cache-Control', 'private, no-store')
  snapshot(@GetCurrentUser() actor: TokenPayload) {
    return this.repository.snapshot(actor);
  }
  @Post('socket-ticket')
  @Header('Cache-Control', 'private, no-store')
  async ticket(
    @GetCurrentUser() actor: TokenPayload,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    const companyId = companyAdmin(actor);
    if (!expected || expected !== companyId)
      throw new ForbiddenException('Session context changed');
    return { companyId, ...(await this.tickets.issue(actor)) };
  }
}
