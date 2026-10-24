import { randomUUID } from 'node:crypto';
import { Temporal } from 'temporal-polyfill';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  FleetRepository,
  publicTracking,
  type FleetTransaction,
} from './fleet.repository.js';
import { FleetEvents } from './fleet-events.js';
import { assertTelemetryOrder, validateTelemetry } from './telemetry-policy.js';
import { instantToMs } from '../../common/utils/temporal.js';

/** Implemented only by a future trusted driver-auth adapter, never request bodies. */
export interface DriverIdentityVerifier {
  verify(
    proof: unknown,
  ): Promise<{ kind: 'driver'; workerId: string; companyId: string }>;
}
export const DRIVER_IDENTITY_VERIFIER = Symbol('DRIVER_IDENTITY_VERIFIER');
@Injectable()
export class UnconfiguredDriverIdentityVerifier implements DriverIdentityVerifier {
  async verify(): Promise<never> {
    throw new UnauthorizedException('Driver authentication is not configured');
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class DriverTelemetryService {
  constructor(
    @Inject(FleetRepository) private readonly repository: FleetRepository,
    @Inject(FleetEvents) private readonly events: FleetEvents,
    @Inject(DRIVER_IDENTITY_VERIFIER)
    private readonly identity: DriverIdentityVerifier,
  ) {}
  private async write<T>(
    proof: unknown,
    operation: (
      tx: FleetTransaction,
      workerId: string,
      companyId: string,
    ) => Promise<T>,
  ): Promise<T> {
    const actor = await this.identity.verify(proof);
    if (
      actor.kind !== 'driver' ||
      !uuid.test(actor.workerId) ||
      !uuid.test(actor.companyId)
    )
      throw new UnauthorizedException();
    const prisma = this.repository.prisma;
    return this.repository.available(() =>
      prisma.db.transaction(async (tx) => {
        // Same company-first order as vehicle assignments/deletion. Worker pinning
        // serializes sessions, samples and future driver reassignment/deletion.
        await tx.execute(
          prisma.db.raw
            .sql`SELECT id FROM companies WHERE id=${actor.companyId} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        await tx.execute(
          prisma.db.raw
            .sql`SELECT id FROM workers WHERE id=${actor.workerId} AND "companyId"=${actor.companyId} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        const company = await tx.orm.public.Company.where({
          id: actor.companyId,
        })
          .select('id', 'suspended')
          .first();
        const worker = await tx.orm.public.Worker.where({
          id: actor.workerId,
          companyId: actor.companyId,
        })
          .select('id', 'status')
          .first();
        if (!company || company.suspended) throw new UnauthorizedException();
        if (!worker) throw new NotFoundException('Driver not found');
        if (worker.status === 'SUSPENDED')
          throw new ForbiddenException('Driver is suspended');
        return operation(tx, actor.workerId, actor.companyId);
      }),
    );
  }
  async startSharing(
    proof: unknown,
    input: { consent: true; expectedRevision: number },
  ) {
    if (
      !input ||
      input.consent !== true ||
      !Number.isInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      input.expectedRevision >= 2147483646 ||
      Object.keys(input).some(
        (k) => !['consent', 'expectedRevision'].includes(k),
      )
    )
      throw new BadRequestException(
        'Explicit sharing consent and expected revision required',
      );
    const result = await this.write(proof, async (tx, workerId, companyId) => {
      const old = await tx.orm.public.DriverTrackingState.where({
        workerId,
        companyId,
      }).first();
      if ((old?.revision ?? 0) !== input.expectedRevision || old?.sharing)
        throw new ConflictException('Sharing session changed');
      const sessionId = randomUUID();
      const data = {
        sharing: true,
        sharingSessionId: sessionId,
        sharingStartedAt: Temporal.Instant.fromEpochMilliseconds(Date.now()),
        sequence: 0,
        revision: (old?.revision ?? 0) + 1,
      };
      if (old)
        await tx.orm.public.DriverTrackingState.where({
          workerId,
          companyId,
        }).update(data);
      else
        await tx.orm.public.DriverTrackingState.create({
          workerId,
          companyId,
          ...data,
        });
      const row = await tx.orm.public.DriverTrackingState.where({
        workerId,
        companyId,
      }).first();
      return {
        companyId,
        driverId: workerId,
        sessionId,
        serverTime: new Date().toISOString(),
        tracking: publicTracking(row),
      };
    });
    const { sessionId, ...data } = result;
    this.events.publish({ name: 'fleet:driver-status-changed', data });
    return { sessionId, tracking: result.tracking };
  }
  async stopSharing(proof: unknown, sessionId: string) {
    if (typeof sessionId !== 'string' || !uuid.test(sessionId))
      throw new BadRequestException('Invalid sharing session');
    const result = await this.write(proof, async (tx, workerId, companyId) => {
      const row = await tx.orm.public.DriverTrackingState.where({
        workerId,
        companyId,
      }).first();
      if (!row || row.sharingSessionId !== sessionId)
        throw new ConflictException('Sharing session changed');
      if (row.sharing) {
        if (row.revision >= 2147483646)
          throw new ConflictException('Tracking revision exhausted');
        await tx.orm.public.DriverTrackingState.where({
          workerId,
          companyId,
          sharingSessionId: sessionId,
        }).update({ sharing: false, revision: row.revision + 1 });
      }
      return {
        companyId,
        driverId: workerId,
        serverTime: new Date().toISOString(),
        tracking: publicTracking(
          await tx.orm.public.DriverTrackingState.where({
            workerId,
            companyId,
          }).first(),
        ),
      };
    });
    this.events.publish({ name: 'fleet:driver-status-changed', data: result });
    return result.tracking;
  }
  async accept(proof: unknown, input: unknown) {
    // Reject identity-bearing fields even if a future adapter accidentally forwards them.
    validateTelemetry(input, Date.now());
    const result = await this.write(proof, async (tx, workerId, companyId) => {
      const now = Date.now();
      const sample = validateTelemetry(input, now);
      const row = await tx.orm.public.DriverTrackingState.where({
        workerId,
        companyId,
      }).first();
      if (!row?.sharing || row.sharingSessionId !== sample.sessionId)
        throw new ForbiddenException(
          'Active consented sharing session required',
        );
      if (row.revision >= 2147483646)
        throw new ConflictException('Tracking revision exhausted');
      if (sample.capturedAt < instantToMs(row.sharingStartedAt))
        throw new BadRequestException('Sample predates sharing consent');
      assertTelemetryOrder(
        sample,
        {
          sequence: row.sequence,
          latitude: row.latitude,
          longitude: row.longitude,
          capturedAt: instantToMs(row.capturedAt),
          receivedAt: instantToMs(row.receivedAt),
          accuracy: row.accuracy,
        },
        now,
      );
      await tx.orm.public.DriverTrackingState.where({
        workerId,
        companyId,
        sharingSessionId: sample.sessionId,
      }).update({
        sequence: sample.sequence,
        latitude: sample.latitude,
        longitude: sample.longitude,
        capturedAt: Temporal.Instant.fromEpochMilliseconds(sample.capturedAt),
        receivedAt: Temporal.Instant.fromEpochMilliseconds(now),
        accuracy: sample.accuracy,
        speed: sample.speed,
        heading: sample.heading,
        revision: row.revision + 1,
      });
      return {
        companyId,
        driverId: workerId,
        serverTime: new Date(now).toISOString(),
        tracking: publicTracking(
          await tx.orm.public.DriverTrackingState.where({
            workerId,
            companyId,
          }).first(),
        ),
      };
    });
    this.events.publish({ name: 'fleet:location-updated', data: result });
    return result.tracking;
  }
}
