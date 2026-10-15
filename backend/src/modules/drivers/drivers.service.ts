import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { DriversRepository } from './drivers.repository.js';
import type { ListDriversDto } from './dto/list-drivers.dto.js';
import type {
  Driver,
  DriverRow,
  DriverDetails,
  DriverPage,
} from './drivers.types.js';

@Injectable()
export class DriversService {
  constructor(
    @Inject(DriversRepository) private readonly repository: DriversRepository,
  ) {}

  private companyId(actor: TokenPayload | undefined): string {
    if (!actor?.sub) throw new UnauthorizedException();
    if (
      actor.role !== 'COMPANY_ADMIN' ||
      typeof actor.orgId !== 'string' ||
      !actor.orgId.trim()
    ) {
      throw new ForbiddenException('Company administrator access required');
    }
    return actor.orgId;
  }

  private publicDriver(row: DriverRow): Driver {
    return {
      id: row.id,
      name: row.fullName,
      phone: row.phone,
      status: row.status,
    };
  }

  async list(actor: TokenPayload, query: ListDriversDto): Promise<DriverPage> {
    const companyId = this.companyId(actor);
    const rows = await this.repository.findPage(companyId, query);
    return {
      companyId,
      items: rows.slice(0, query.pageSize).map((row) => this.publicDriver(row)),
      page: query.page,
      pageSize: query.pageSize,
      hasNext: rows.length > query.pageSize,
    };
  }

  async details(actor: TokenPayload, id: string): Promise<DriverDetails> {
    const companyId = this.companyId(actor);
    const row = await this.repository.findOne(companyId, id);
    if (!row) throw new NotFoundException('Driver not found');
    return { companyId, driver: this.publicDriver(row) };
  }
}
