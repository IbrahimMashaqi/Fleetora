import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import type { HeadquartersInput } from './fleet.dto.js';
import type {
  FleetSnapshot,
  Headquarters,
  FleetTracking,
} from './fleet.types.js';
import { FLEET_FRESHNESS_SECONDS } from './telemetry-policy.js';
import { instantToMs } from '../../common/utils/temporal.js';
import { Temporal } from 'temporal-polyfill';

export type FleetTransaction = Parameters<
  Parameters<PrismaService['db']['transaction']>[0]
>[0];
export function companyAdmin(actor: TokenPayload | undefined): string {
  if (!actor?.sub) throw new UnauthorizedException();
  if (actor.role !== 'COMPANY_ADMIN' || !actor.orgId?.trim())
    throw new ForbiddenException('Company administrator access required');
  return actor.orgId;
}
export function timestamp(value: unknown): string {
  return new Date(instantToMs(value)).toISOString();
}
export type TrackingRow = NonNullable<
  Awaited<ReturnType<PrismaService['DriverTrackingState']['first']>>
>;
export function publicTracking(row: TrackingRow | null): FleetTracking {
  if (!row)
    return {
      revision: 0,
      sharing: false,
      sharingStartedAt: null,
      location: null,
    };
  return {
    revision: row.revision,
    sharing: row.sharing,
    sharingStartedAt: timestamp(row.sharingStartedAt),
    location:
      row.latitude !== null &&
      row.longitude !== null &&
      row.capturedAt &&
      row.receivedAt
        ? {
            latitude: row.latitude,
            longitude: row.longitude,
            capturedAt: timestamp(row.capturedAt),
            receivedAt: timestamp(row.receivedAt),
            accuracy: row.accuracy,
            speed: row.speed,
            heading: row.heading,
          }
        : null,
  };
}
type HeadquartersRow = NonNullable<
  Awaited<ReturnType<PrismaService['CompanyHeadquarters']['first']>>
>;
export function publicHeadquarters(
  row: HeadquartersRow | null,
): Headquarters | null {
  return row
    ? {
        latitude: row.latitude,
        longitude: row.longitude,
        address: row.address,
        revision: row.revision,
        updatedAt: timestamp(row.updatedAt),
      }
    : null;
}
@Injectable()
export class FleetRepository {
  constructor(@Inject(PrismaService) readonly prisma: PrismaService) {}

  async available<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        (('code' in error && ['42P01', '42703'].includes(String(error.code))) ||
          ('sqlState' in error &&
            ['42P01', '42703'].includes(String(error.sqlState))))
      )
        throw new ServiceUnavailableException(
          'Fleet tracking schema is not deployed',
        );
      throw error;
    }
  }
  async validateActor(
    tx: FleetTransaction,
    actor: TokenPayload,
    companyId: string,
  ): Promise<void> {
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
  }
  async admin<T>(
    actor: TokenPayload,
    write: boolean,
    operation: (tx: FleetTransaction, companyId: string) => Promise<T>,
  ): Promise<T> {
    const companyId = companyAdmin(actor);
    return this.available(() =>
      this.prisma.db.transaction(async (tx) => {
        if (write) {
          await tx.execute(
            this.prisma.db.raw
              .sql`SELECT id FROM companies WHERE id=${companyId} FOR UPDATE`
              .affectedCount()
              .build(),
          );
          await tx.execute(
            this.prisma.db.raw
              .sql`SELECT id FROM users WHERE id=${actor.sub} FOR UPDATE`
              .affectedCount()
              .build(),
          );
        } else {
          // Pin the persisted principal and tenant until the complete GPS snapshot
          // is read, preventing revocation/company changes between awaited reads.
          await tx.execute(
            this.prisma.db.raw
              .sql`SELECT id FROM companies WHERE id=${companyId} FOR SHARE`
              .affectedCount()
              .build(),
          );
          await tx.execute(
            this.prisma.db.raw
              .sql`SELECT id FROM users WHERE id=${actor.sub} FOR SHARE`
              .affectedCount()
              .build(),
          );
        }
        await this.validateActor(tx, actor, companyId);
        return operation(tx, companyId);
      }),
    );
  }
  async headquarters(
    actor: TokenPayload,
  ): Promise<{ companyId: string; headquarters: Headquarters | null }> {
    return this.admin(actor, false, async (tx, companyId) => ({
      companyId,
      headquarters: publicHeadquarters(
        await tx.orm.public.CompanyHeadquarters.where({ companyId }).first(),
      ),
    }));
  }
  async saveHeadquarters(
    actor: TokenPayload,
    input: HeadquartersInput,
  ): Promise<{ companyId: string; headquarters: Headquarters }> {
    return this.admin(actor, true, async (tx, companyId) => {
      const previous = await tx.orm.public.CompanyHeadquarters.where({
        companyId,
      }).first();
      if ((previous?.revision ?? 0) !== input.expectedRevision)
        throw new ConflictException(
          'Headquarters changed. Reload before saving',
        );
      const data = {
        latitude: input.latitude,
        longitude: input.longitude,
        address: input.address ?? null,
        revision: (previous?.revision ?? 0) + 1,
        updatedAt: Temporal.Instant.fromEpochMilliseconds(Date.now()),
      };
      if (previous)
        await tx.orm.public.CompanyHeadquarters.where({
          companyId,
          revision: previous.revision,
        }).update(data);
      else
        await tx.orm.public.CompanyHeadquarters.create({ companyId, ...data });
      const result = publicHeadquarters(
        await tx.orm.public.CompanyHeadquarters.where({ companyId }).first(),
      );
      if (!result) throw new NotFoundException();
      return { companyId, headquarters: result };
    });
  }
  async snapshot(actor: TokenPayload): Promise<FleetSnapshot> {
    return this.admin(actor, false, async (tx, companyId) => {
      // One bounded snapshot; reject excessive fleets rather than silently hide drivers.
      const rows = await tx.orm.public.Worker.where({ companyId })
        .select('id', 'fullName', 'phone')
        .include('vehicle', (v) =>
          v
            .where({ companyId })
            .select('id', 'type', 'plateNumber', 'manufacturer', 'model'),
        )
        .include('trackingState', (s) => s.where({ companyId }))
        .orderBy([(w) => w.fullName.asc(), (w) => w.id.asc()])
        .limit(10001)
        .all();
      if (rows.length > 10000)
        throw new ServiceUnavailableException(
          'Fleet snapshot exceeds supported size',
        );
      const headquarters = publicHeadquarters(
        await tx.orm.public.CompanyHeadquarters.where({ companyId }).first(),
      );
      return {
        companyId,
        serverTime: new Date().toISOString(),
        freshnessSeconds: FLEET_FRESHNESS_SECONDS,
        headquarters,
        drivers: rows.map((row) => ({
          id: row.id,
          name: row.fullName,
          phone: row.phone,
          vehicle: row.vehicle,
          tracking: publicTracking(row.trackingState),
        })),
      };
    });
  }
}
