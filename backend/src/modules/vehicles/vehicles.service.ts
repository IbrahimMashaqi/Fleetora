import { vehicleCatalog } from './vehicle-catalog.js';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { TokenPayload } from '../auth/token/token.payload.js';
import type { VehicleInputDto, VehicleQueryDto } from './vehicles.dto.js';
import { VehiclesRepository, fleetCompany } from './vehicles.repository.js';
import { publicVehicle } from './vehicles.types.js';
@Injectable()
export class VehiclesService {
  constructor(
    @Inject(VehiclesRepository) private readonly repository: VehiclesRepository,
  ) {}
  async list(actor: TokenPayload, query: VehicleQueryDto) {
    const companyId = fleetCompany(actor);
    const rows = await this.repository.list(companyId, query);
    return {
      companyId,
      catalog: vehicleCatalog,
      items: rows
        .slice(0, query.pageSize)
        .map((row) => publicVehicle(row, companyId)),
      page: query.page,
      pageSize: query.pageSize,
      hasNext: rows.length > query.pageSize,
    };
  }
  async details(actor: TokenPayload, id: string) {
    const companyId = fleetCompany(actor);
    const row = await this.repository.find(companyId, id);
    if (!row) throw new NotFoundException('Vehicle not found');
    return { companyId, vehicle: publicVehicle(row, companyId) };
  }
  async save(actor: TokenPayload, input: VehicleInputDto, id?: string) {
    fleetCompany(actor);
    const saved = await this.repository.save(actor, input, id);
    return this.details(actor, saved);
  }
  async remove(actor: TokenPayload, id: string): Promise<void> {
    fleetCompany(actor);
    await this.repository.remove(actor, id);
  }
}
