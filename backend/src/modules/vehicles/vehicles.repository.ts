import { normalizeManufacturer, validCatalogPair } from './vehicle-catalog.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { or, not } from '@prisma/orm-postgres/orm-client';
import type { TokenPayload } from '../auth/token/token.payload.js';
import type {
  AssignmentDto,
  VehicleInputDto,
  VehicleQueryDto,
} from './vehicles.dto.js';
import type { VehicleRow } from './vehicles.types.js';
export function fleetCompany(actor: TokenPayload | undefined): string {
  if (!actor?.sub) throw new UnauthorizedException();
  if (actor.role !== 'COMPANY_ADMIN' || !actor.orgId?.trim())
    throw new ForbiddenException('Company administrator access required');
  return actor.orgId;
}
@Injectable()
export class VehiclesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async list(companyId: string, query: VehicleQueryDto): Promise<VehicleRow[]> {
    const scoped = this.prisma.Vehicle.where({ companyId });
    const available = query.unassigned
      ? scoped.where((v) => not(v.worker.some()))
      : scoped;
    const term = query.search?.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
    const filtered = term
      ? available.where((v) =>
          or(
            v.manufacturer.ilike(`%${term}%`),
            v.model.ilike(`%${term}%`),
            v.plateNumber.ilike(`%${term}%`),
          ),
        )
      : available;
    return filtered
      .select('id', 'companyId', 'manufacturer', 'model', 'type', 'plateNumber')
      .include('worker', (w) =>
        w.where({ companyId }).select('id', 'companyId', 'fullName'),
      )
      .orderBy([(v) => v.plateNumber.asc(), (v) => v.id.asc()])
      .offset((query.page - 1) * query.pageSize)
      .limit(query.pageSize + 1)
      .all();
  }
  async find(companyId: string, id: string): Promise<VehicleRow | null> {
    return this.prisma.Vehicle.where({ companyId, id })
      .select('id', 'companyId', 'manufacturer', 'model', 'type', 'plateNumber')
      .include('worker', (w) =>
        w.where({ companyId }).select('id', 'companyId', 'fullName'),
      )
      .first();
  }
  // All fleet writes lock company then actor in the same order. This serializes
  // duplicate checks/assignment changes and pins identity until commit. The
  // existing unique workers.vehicleId constraint also rejects external races.
  private async write<T>(
    actor: TokenPayload,
    operation: (
      tx: Parameters<Parameters<PrismaService['db']['transaction']>[0]>[0],
      companyId: string,
    ) => Promise<T>,
  ): Promise<T> {
    const companyId = fleetCompany(actor);
    try {
      return await this.prisma.db.transaction(async (tx) => {
        await tx.execute(
          this.prisma.db.raw
            .sql`SELECT "id" FROM "companies" WHERE "id"=${companyId} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        await tx.execute(
          this.prisma.db.raw
            .sql`SELECT "id" FROM "users" WHERE "id"=${actor.sub} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        const user = await tx.orm.public.User.where({ id: actor.sub })
          .select('id', 'role', 'companyId', 'isActive', 'isEmailVerified')
          .first();
        const company = await tx.orm.public.Company.where({ id: companyId })
          .select('id', 'suspended')
          .first();
        if (
          !user?.isActive ||
          !user.isEmailVerified ||
          !company ||
          company.suspended
        )
          throw new UnauthorizedException();
        if (user.role !== 'COMPANY_ADMIN' || user.companyId !== companyId)
          throw new ForbiddenException('Session context changed');
        return operation(tx, companyId);
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        (('code' in error &&
          (error.code === '23505' || error.code === 'P2002')) ||
          ('sqlState' in error && error.sqlState === '23505'))
      )
        throw new ConflictException('Vehicle or plate is already in use');
      throw error;
    }
  }
  async save(
    actor: TokenPayload,
    input: VehicleInputDto,
    id?: string,
  ): Promise<string> {
    return this.write(actor, async (tx, companyId) => {
      const existing = id
        ? await tx.orm.public.Vehicle.where({ id, companyId })
            .select('id', 'manufacturer', 'model')
            .first()
        : null;
      if (id && !existing) throw new NotFoundException('Vehicle not found');
      // Preserve the stored pair on unrelated edits, including legacy aliases
      // and combinations predating this curated catalog.
      const unchanged =
        !!existing &&
        normalizeManufacturer(existing.manufacturer ?? '') ===
          normalizeManufacturer(input.manufacturer ?? '') &&
        (existing.model ?? '').trim() === (input.model ?? '').trim();
      if (!unchanged && !validCatalogPair(input.manufacturer, input.model))
        throw new BadRequestException('Model belongs to another manufacturer');
      // Legacy plates may contain surrounding spaces or mixed case. Match the
      // migration preflight without rewriting those records. Two matches suffice
      // to distinguish this vehicle from a conflicting normalized plate.
      const duplicates = await tx.query(
        this.prisma.db.raw.sql`SELECT "id" FROM "vehicles"
          WHERE "companyId"=${companyId}
          AND upper(btrim("plateNumber")) = upper(btrim(${input.plateNumber}))
          LIMIT 2`
          .returnsRow({ id: 'pg/text@1' })
          .build(),
      );
      if (duplicates.some((duplicate) => duplicate.id !== id))
        throw new ConflictException('A vehicle with this plate already exists');
      const data = {
        manufacturer: unchanged
          ? existing.manufacturer
          : (input.manufacturer ?? null),
        model: unchanged ? existing.model : (input.model ?? null),
        type: input.type,
        plateNumber: input.plateNumber,
      };
      if (id) {
        await tx.orm.public.Vehicle.where({ id, companyId }).update(data);
        return id;
      }
      return (await tx.orm.public.Vehicle.create({ companyId, ...data })).id;
    });
  }
  async remove(actor: TokenPayload, id: string): Promise<void> {
    try {
      await this.write(actor, async (tx, companyId) => {
        // The company lock shared with assign() serializes fleet mutations.
        // Locking the vehicle also prevents new external FK references while
        // its existing company-scoped assignment is cleared and it is deleted.
        await tx.execute(
          this.prisma.db.raw
            .sql`SELECT "id" FROM "vehicles" WHERE "id"=${id} AND "companyId"=${companyId} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        const vehicle = await tx.orm.public.Vehicle.where({ id, companyId })
          .select('id')
          .first();
        if (!vehicle) throw new NotFoundException('Vehicle not found');
        await tx.orm.public.Worker.where({ companyId, vehicleId: id }).update({
          vehicleId: null,
        });
        await tx.orm.public.Vehicle.where({ id, companyId }).delete();
      });
    } catch (error: unknown) {
      // Never unassign a foreign-company worker or cascade through another
      // reference. A restrictive FK rolls back the complete transaction.
      if (
        error &&
        typeof error === 'object' &&
        (('code' in error &&
          (error.code === '23503' || error.code === 'P2003')) ||
          ('sqlState' in error && error.sqlState === '23503'))
      )
        throw new ConflictException(
          'Vehicle is still referenced and cannot be deleted',
        );
      throw error;
    }
  }
  async assign(
    actor: TokenPayload,
    id: string,
    input: AssignmentDto,
  ): Promise<void> {
    return this.write(actor, async (tx, companyId) => {
      await tx.execute(
        this.prisma.db.raw
          .sql`SELECT "id" FROM "workers" WHERE "id"=${id} AND "companyId"=${companyId} FOR UPDATE`
          .affectedCount()
          .build(),
      );
      const driver = await tx.orm.public.Worker.where({ id, companyId })
        .select('id', 'vehicleId')
        .first();
      if (!driver) throw new NotFoundException('Driver or vehicle not found');
      if (input.vehicleId) {
        await tx.execute(
          this.prisma.db.raw
            .sql`SELECT "id" FROM "vehicles" WHERE "id"=${input.vehicleId} AND "companyId"=${companyId} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        if (
          !(await tx.orm.public.Vehicle.where({
            id: input.vehicleId,
            companyId,
          })
            .select('id')
            .first())
        )
          throw new NotFoundException('Driver or vehicle not found');
      }
      if (driver.vehicleId !== input.expectedVehicleId)
        throw new ConflictException(
          'Assignment changed. Reload the driver before trying again',
        );
      if (input.vehicleId) {
        const assigned = await tx.orm.public.Worker.where({
          companyId,
          vehicleId: input.vehicleId,
        })
          .select('id')
          .first();
        if (assigned && assigned.id !== id)
          throw new ConflictException('This vehicle is already assigned');
      }
      await tx.orm.public.Worker.where({
        id,
        companyId,
        vehicleId: input.expectedVehicleId,
      }).update({ vehicleId: input.vehicleId });
    });
  }
}
