import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { expectedCompany, parcelValidation } from './parcel-http.js';
import { PageDto, ReturnInputDto, TransitionDto } from './parcel.dto.js';
import { ParcelOperationsRepository } from './parcel-operations.repository.js';
@ApiTags('parcel-returns')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@UsePipes(parcelValidation)
@Controller('returns')
export class ReturnsController {
  constructor(
    @Inject(ParcelOperationsRepository)
    private readonly operations: ParcelOperationsRepository,
  ) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(
    @GetCurrentUser() actor: TokenPayload,
    @Query() q: PageDto,
  ) {
    return this.operations.returns(actor, q);
  }
  @Post() create(
    @GetCurrentUser() actor: TokenPayload,
    @Body() input: ReturnInputDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.operations.startReturn(actor, input);
  }
  @Post(':id/transition') transition(
    @GetCurrentUser() actor: TokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: TransitionDto,
    @Headers('x-fleetora-company-context') expected: string | undefined,
  ) {
    expectedCompany(actor, expected);
    return this.operations.returnTransition(actor, id, input);
  }
}
