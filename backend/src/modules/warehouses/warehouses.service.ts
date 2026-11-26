import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { fleetCompany } from '../vehicles/vehicles.repository.js';
import { company } from '../parcels/parcel-domain.js';
import type { ListWarehousesDto } from './dto/list-warehouses.dto.js';
import type { WarehouseInputDto } from './dto/warehouse-input.dto.js';
import { WarehousesRepository } from './warehouses.repository.js';
import type {
  Warehouse,
  WarehouseDetails,
  WarehousePage,
  WarehouseRow,
} from './warehouses.types.js';

function publicWarehouse(row: WarehouseRow): Warehouse {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    archived: row.archivedAt !== null,
  };
}

@Injectable()
export class WarehousesService {
  constructor(
    @Inject(WarehousesRepository)
    private readonly repository: WarehousesRepository,
  ) {}

  async list(
    actor: TokenPayload,
    query: ListWarehousesDto,
  ): Promise<WarehousePage> {
    const companyId = company(actor, 'viewWarehouses');
    const rows = await this.repository.findPage(companyId, query);
    return {
      companyId,
      items: rows.slice(0, query.pageSize).map(publicWarehouse),
      page: query.page,
      pageSize: query.pageSize,
      hasNext: rows.length > query.pageSize,
    };
  }

  async details(actor: TokenPayload, id: string): Promise<WarehouseDetails> {
    const companyId = company(actor, 'viewWarehouses');
    const row = await this.repository.findOne(companyId, id);
    if (!row) throw new NotFoundException('Warehouse not found');
    return { companyId, warehouse: publicWarehouse(row) };
  }

  async create(
    actor: TokenPayload,
    input: WarehouseInputDto,
  ): Promise<WarehouseDetails> {
    fleetCompany(actor);
    const id = await this.repository.create(actor, input);
    return this.details(actor, id);
  }

  async update(
    actor: TokenPayload,
    id: string,
    input: WarehouseInputDto,
  ): Promise<WarehouseDetails> {
    fleetCompany(actor);
    await this.repository.update(actor, id, input);
    return this.details(actor, id);
  }

  async setArchived(
    actor: TokenPayload,
    id: string,
    archived: boolean,
  ): Promise<WarehouseDetails> {
    fleetCompany(actor);
    await this.repository.setArchived(actor, id, archived);
    return this.details(actor, id);
  }
}
