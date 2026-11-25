import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Temporal } from 'temporal-polyfill';
import { or } from '@prisma/orm-postgres/orm-client';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { lockedFleetWrite } from '../vehicles/vehicles.repository.js';
import type { WarehouseInputDto } from './dto/warehouse-input.dto.js';
import type { ListWarehousesDto } from './dto/list-warehouses.dto.js';
import type { WarehouseRow } from './warehouses.types.js';

type Transaction = Parameters<
  Parameters<PrismaService['db']['transaction']>[0]
>[0];

// Pickups in these states still expect to use their warehouse.
const OPEN_PICKUP_STATES = ['REQUESTED', 'PROPOSED', 'CONFIRMED'];

/**
 * Returns whether an active warehouse of the company can be linked, holding a
 * share lock until commit so a concurrent archive waits for this link (and then
 * sees it as an open pickup) instead of archiving underneath it.
 */
export async function lockLinkableWarehouse(
  prisma: PrismaService,
  tx: Transaction,
  id: string,
  companyId: string,
): Promise<boolean> {
  await tx.execute(
    prisma.db.raw
      .sql`SELECT "id" FROM "warehouses" WHERE "id"=${id} AND "companyId"=${companyId} FOR SHARE`
      .affectedCount()
      .build(),
  );
  const warehouse = await tx.orm.public.Warehouse.where({ id, companyId })
    .where((w) => w.archivedAt.isNull())
    .select('id')
    .first();
  return !!warehouse;
}

@Injectable()
export class WarehousesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findPage(
    companyId: string,
    query: ListWarehousesDto,
  ): Promise<WarehouseRow[]> {
    const scoped = this.prisma.Warehouse.where({ companyId }).where((w) =>
      query.status === 'ARCHIVED' ? w.archivedAt.isNotNull() : w.archivedAt.isNull(),
    );
    const pattern = `%${(query.search ?? '').replace(/[\\%_]/g, '\\$&')}%`;
    const filtered = query.search
      ? scoped.where((w) => or(w.name.ilike(pattern), w.address.ilike(pattern)))
      : scoped;
    return await filtered
      .select('id', 'name', 'address', 'archivedAt')
      .orderBy([(w) => w.name.asc(), (w) => w.id.asc()])
      .offset((query.page - 1) * query.pageSize)
      .limit(query.pageSize + 1)
      .all();
  }

  async findOne(companyId: string, id: string): Promise<WarehouseRow | null> {
    return this.prisma.Warehouse.where({ companyId, id })
      .select('id', 'name', 'address', 'archivedAt')
      .first();
  }

  async create(actor: TokenPayload, input: WarehouseInputDto): Promise<string> {
    return lockedFleetWrite(this.prisma, actor, async (tx, companyId) => {
      const created = await tx.orm.public.Warehouse.create({
        companyId,
        name: input.name,
        address: input.address,
      });
      return created.id;
    });
  }

  async update(
    actor: TokenPayload,
    id: string,
    input: WarehouseInputDto,
  ): Promise<void> {
    await lockedFleetWrite(this.prisma, actor, async (tx, companyId) => {
      const warehouse = await this.lockWarehouse(tx, id, companyId);
      if (warehouse.archivedAt)
        throw new ConflictException('Restore the warehouse before editing it');
      await tx.orm.public.Warehouse.where({ id, companyId }).update({
        name: input.name,
        address: input.address,
      });
    });
  }

  async setArchived(
    actor: TokenPayload,
    id: string,
    archived: boolean,
  ): Promise<void> {
    await lockedFleetWrite(this.prisma, actor, async (tx, companyId) => {
      const warehouse = await this.lockWarehouse(tx, id, companyId);
      if (archived === !!warehouse.archivedAt) return;
      if (
        archived &&
        (await tx.orm.public.PickupRequest.where({ companyId, warehouseId: id })
          .where((p) => p.status.in(OPEN_PICKUP_STATES))
          .select('id')
          .first())
      )
        throw new ConflictException('Warehouse has open pickup requests');
      await tx.orm.public.Warehouse.where({ id, companyId }).update({
        archivedAt: archived ? Temporal.Now.instant() : null,
      });
    });
  }

  private async lockWarehouse(tx: Transaction, id: string, companyId: string) {
    await tx.execute(
      this.prisma.db.raw
        .sql`SELECT "id" FROM "warehouses" WHERE "id"=${id} AND "companyId"=${companyId} FOR UPDATE`
        .affectedCount()
        .build(),
    );
    const warehouse = await tx.orm.public.Warehouse.where({ id, companyId })
      .select('id', 'archivedAt')
      .first();
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return warehouse;
  }
}
