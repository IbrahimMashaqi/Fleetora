import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeDriverPhone } from './driver-phone.js';
import { Temporal } from 'temporal-polyfill';
import { or } from '@prisma/orm-postgres/orm-client';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { lockedFleetWrite } from '../vehicles/vehicles.repository.js';
import type { DriverInputDto } from './dto/driver-input.dto.js';
import type { ListDriversDto } from './dto/list-drivers.dto.js';
import type { DriverRow } from './drivers.types.js';

@Injectable()
export class DriversRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findPage(
    companyId: string,
    query: ListDriversDto,
  ): Promise<DriverRow[]> {
    const scoped = this.prisma.Worker.where({ companyId });
    const pattern = `%${(query.search ?? '').replace(/[\\%_]/g, '\\$&')}%`;
    const filtered = query.search
      ? scoped.where((worker) =>
          or(worker.fullName.ilike(pattern), worker.phone.ilike(pattern)),
        )
      : scoped;
    return await filtered
      .select('id', 'fullName', 'phone', 'status')
      .include('vehicle', (vehicle) =>
        vehicle
          .where({ companyId })
          .select(
            'id',
            'companyId',
            'type',
            'plateNumber',
            'manufacturer',
            'model',
          ),
      )
      .orderBy([(worker) => worker.fullName.asc(), (worker) => worker.id.asc()])
      .offset((query.page - 1) * query.pageSize)
      .limit(query.pageSize + 1)
      .all();
  }

  async findOne(companyId: string, id: string): Promise<DriverRow | null> {
    return this.prisma.Worker.where({ companyId, id })
      .select('id', 'fullName', 'phone', 'status')
      .include('vehicle', (vehicle) =>
        vehicle
          .where({ companyId })
          .select(
            'id',
            'companyId',
            'type',
            'plateNumber',
            'manufacturer',
            'model',
          ),
      )
      .first();
  }

  // Writes reuse the fleet lock order (company, then actor) so identity and
  // tenant state are re-verified inside the transaction that performs them.
  async create(actor: TokenPayload, input: DriverInputDto): Promise<string> {
    return lockedFleetWrite(
      this.prisma,
      actor,
      async (tx, companyId) => {
        const created = await tx.orm.public.Worker.create({
          companyId,
          fullName: input.name,
          phone: input.phone,
          status: 'OFFLINE',
        });
        return created.id;
      },
      'manageDrivers',
    );
  }

  async update(
    actor: TokenPayload,
    id: string,
    input: DriverInputDto,
  ): Promise<void> {
    await lockedFleetWrite(
      this.prisma,
      actor,
      async (tx, companyId) => {
        const worker = await this.lockDriver(tx, id, companyId);
        const account = await tx.orm.public.DriverAccount.where({ companyId, workerId: id }).include('user', user => user.select('isActive')).first();
        if (account && normalizeDriverPhone(input.phone) !== account.phone && account.user?.isActive)
          throw new ConflictException('Revoke driver access before changing the login phone');
        if (worker.phone !== input.phone) await tx.orm.public.DriverInvitation.where({ companyId, workerId: id }).where(i => i.acceptedAt.isNull()).where(i => i.revokedAt.isNull()).update({ revokedAt: Temporal.Now.instant() });
        await tx.orm.public.Worker.where({ id, companyId }).update({
          fullName: input.name,
          phone: input.phone,
        });
      },
      'manageDrivers',
    );
  }

  // Suspension is an administrative override. Reactivation returns the driver
  // to OFFLINE; ACTIVE and ON_BREAK are operational states the driver sets.
  async setSuspended(
    actor: TokenPayload,
    id: string,
    suspended: boolean,
    reason?: string,
  ): Promise<void> {
    await lockedFleetWrite(
      this.prisma,
      actor,
      async (tx, companyId) => {
        const driver = await this.lockDriver(tx, id, companyId);
        if ((suspended && !reason?.trim()) || (reason !== undefined && (!reason.trim() || reason.length > 500)))
          throw new BadRequestException('A documented suspension reason is required (1 to 500 characters)');
        if (suspended === (driver.status === 'SUSPENDED')) return;
        await tx.orm.public.Worker.where({ id, companyId }).update({
          status: suspended ? 'SUSPENDED' : 'OFFLINE',
        });
        await tx.orm.public.DriverAccessEvent.create({ companyId, workerId: id, actorId: actor.sub,
          action: suspended ? 'DRIVER_SUSPENDED' : 'DRIVER_REACTIVATED',
          details: { previousStatus: driver.status, reason: reason?.trim() ?? null } });
      },
      'manageDrivers',
    );
  }

  private async lockDriver(
    tx: Parameters<Parameters<typeof lockedFleetWrite>[2]>[0],
    id: string,
    companyId: string,
  ) {
    await tx.execute(
      this.prisma.db.raw
        .sql`SELECT "id" FROM "workers" WHERE "id"=${id} AND "companyId"=${companyId} FOR UPDATE`
        .affectedCount()
        .build(),
    );
    const driver = await tx.orm.public.Worker.where({ id, companyId })
      .select('id', 'status', 'phone')
      .first();
    if (!driver) throw new NotFoundException('Driver not found');
    return driver;
  }
}
