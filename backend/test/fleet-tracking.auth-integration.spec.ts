import { randomBytes } from 'node:crypto';
import { Temporal } from 'temporal-polyfill';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { FleetRepository } from '../src/modules/fleet/fleet.repository.js';
import {
  DriverTelemetryService,
  UnconfiguredDriverIdentityVerifier,
  type DriverIdentityVerifier,
} from '../src/modules/fleet/driver-telemetry.service.js';
import { FleetEvents } from '../src/modules/fleet/fleet-events.js';
import type { TokenPayload } from '../src/modules/auth/token/token.payload.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
  requireDisposableAuthTestDatabase,
} from './auth-postgres.safety.js';

const companyId = '81111111-1111-4111-8111-111111111111';
const foreignId = '82222222-2222-4222-8222-222222222222';
const userId = '83333333-3333-4333-8333-333333333333';
const driverId = '84444444-4444-4444-8444-444444444444';
const foreignDriverId = '85555555-5555-4555-8555-555555555555';
const vehicleId = '86666666-6666-4666-8666-666666666666';
const actor: TokenPayload = {
  sub: userId,
  email: 'tracking@example.invalid',
  role: 'COMPANY_ADMIN',
  orgId: companyId,
};
const proof = Symbol('fixture authenticated driver');
const verifier: DriverIdentityVerifier = {
  async verify(value) {
    if (value !== proof) throw new Error('Unauthorized driver proof');
    return { kind: 'driver', workerId: driverId, companyId };
  },
};
describe('fleet tracking on owned disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  let prisma: PrismaService;
  let repository: FleetRepository;
  let telemetry: DriverTelemetryService;
  let events: FleetEvents;
  async function cleanup() {
    guard.assertVerified();
    for (const id of [companyId, foreignId]) {
      await prisma.DriverTrackingState.where({ companyId: id }).delete();
      await prisma.CompanyHeadquarters.where({ companyId: id }).delete();
      await prisma.Worker.where({ companyId: id }).delete();
      await prisma.Vehicle.where({ companyId: id }).delete();
      await prisma.User.where({ companyId: id }).delete();
      await prisma.Company.where({ id }).delete();
    }
  }
  beforeAll(async () => {
    prisma = new PrismaService();
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    repository = new FleetRepository(prisma);
    events = new FleetEvents();
    telemetry = new DriverTelemetryService(repository, events, verifier);
  });
  beforeEach(async () => {
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    await cleanup();
    for (const id of [companyId, foreignId])
      await prisma.Company.create({ id, name: 'Fictional tracking fixture' });
    await prisma.User.create({
      id: userId,
      companyId,
      fullName: 'Fictional Administrator',
      email: actor.email,
      role: 'COMPANY_ADMIN',
      isActive: true,
      isEmailVerified: true,
      password: randomBytes(32).toString('hex'),
    });
    await prisma.Vehicle.create({
      id: vehicleId,
      companyId,
      type: 'VAN',
      plateNumber: 'FICTIONAL-TRACKING',
      manufacturer: 'Toyota',
      model: 'Hilux',
    });
    await prisma.Worker.create({
      id: driverId,
      companyId,
      fullName: 'Fictional Driver',
      phone: '+000000000',
      vehicleId,
    });
    await prisma.Worker.create({
      id: foreignDriverId,
      companyId: foreignId,
      fullName: 'Foreign Fictional Driver',
      phone: '+000000001',
    });
  });
  afterAll(async () => {
    await guard.teardown(
      async () => {
        await guard.verify(() => readAuthPostgresIdentity(prisma));
        await cleanup();
      },
      async () => {
        events?.onModuleDestroy();
        await prisma?.db.close();
      },
    );
  });
  it('returns real workers and assigned vehicle without inventing GPS, and no foreign workers', async () => {
    const snapshot = await repository.snapshot(actor);
    expect(snapshot.drivers).toHaveLength(1);
    expect(snapshot.drivers[0]).toMatchObject({
      id: driverId,
      vehicle: { id: vehicleId, plateNumber: 'FICTIONAL-TRACKING' },
      tracking: { revision: 0, sharing: false, location: null },
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /password|refreshToken|verificationToken|sharingSessionId/,
    );
  });
  it('persists headquarters across repository instances, isolates reads, prevents stale overwrite', async () => {
    expect((await repository.headquarters(actor)).headquarters).toBeNull();
    await repository.saveHeadquarters(actor, {
      latitude: 31.9,
      longitude: 35.2,
      address: 'Fictional HQ',
      expectedRevision: 0,
    });
    expect(
      (await new FleetRepository(prisma).headquarters(actor)).headquarters,
    ).toMatchObject({ latitude: 31.9, revision: 1 });
    expect(
      await prisma.CompanyHeadquarters.where({ companyId: foreignId }).first(),
    ).toBeNull();
    await expect(
      repository.saveHeadquarters(actor, {
        latitude: 32,
        longitude: 35,
        address: null,
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it.each(['PLATFORM_ADMIN', 'MERCHANT', 'ACCOUNTANT'] as const)(
    'rejects %s',
    async (role) => {
      await expect(
        repository.snapshot({ ...actor, role }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        repository.saveHeadquarters(
          { ...actor, role },
          { latitude: 31, longitude: 35, expectedRevision: 0 },
        ),
      ).rejects.toMatchObject({ status: 403 });
    },
  );
  it('enforces persisted role and company rather than stale token claims', async () => {
    await prisma.User.where({ id: userId }).update({ role: 'MERCHANT' });
    await expect(repository.snapshot(actor)).rejects.toMatchObject({
      status: 403,
    });
    await prisma.User.where({ id: userId }).update({
      role: 'COMPANY_ADMIN',
      companyId: foreignId,
    });
    await expect(
      repository.saveHeadquarters(actor, {
        latitude: 31,
        longitude: 35,
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await prisma.CompanyHeadquarters.where({ companyId }).first(),
    ).toBeNull();
  });
  it('rejects inactive, unverified and suspended principals', async () => {
    for (const data of [
      { isActive: false },
      { isActive: true, isEmailVerified: false },
    ]) {
      await prisma.User.where({ id: userId }).update(data);
      await expect(repository.snapshot(actor)).rejects.toMatchObject({
        status: 401,
      });
    }
    await prisma.User.where({ id: userId }).update({ isEmailVerified: true });
    await prisma.Company.where({ id: companyId }).update({ suspended: true });
    await expect(repository.headquarters(actor)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('denies all driver ingestion until a trusted auth adapter is configured', async () => {
    const disabled = new DriverTelemetryService(
      repository,
      events,
      new UnconfiguredDriverIdentityVerifier(),
    );
    await expect(
      disabled.startSharing(
        { role: 'COMPANY_ADMIN', workerId: driverId },
        { consent: true, expectedRevision: 0 },
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(await prisma.DriverTrackingState.first()).toBeNull();
  });
  it('pins driver identity to the trusted verifier and never accepts company/worker body identity', async () => {
    await expect(
      telemetry.startSharing(
        { workerId: driverId },
        { consent: true, expectedRevision: 0 },
      ),
    ).rejects.toThrow('Unauthorized');
    const session = await telemetry.startSharing(proof, {
      consent: true,
      expectedRevision: 0,
    });
    await expect(
      telemetry.accept(proof, {
        ...sample(session.sessionId),
        workerId: foreignDriverId,
      }),
    ).rejects.toMatchObject({ status: 400 });
    const spoof = new DriverTelemetryService(repository, events, {
      async verify() {
        return { kind: 'driver', workerId: foreignDriverId, companyId };
      },
    });
    await expect(
      spoof.startSharing(proof, { consent: true, expectedRevision: 0 }),
    ).rejects.toMatchObject({ status: 404 });
  });
  function sample(sessionId: string) {
    return {
      sessionId,
      sequence: 1,
      latitude: 31.9,
      longitude: 35.2,
      capturedAt: new Date().toISOString(),
      accuracy: 8,
      speed: 4,
      heading: 90,
    };
  }
  it('stores latest captured/received sample and broadcasts only tenant minimal projection after commit', async () => {
    const received: unknown[] = [];
    const foreign: unknown[] = [];
    const unsubscribe = events.subscribe(companyId, (event) =>
      received.push(event),
    );
    const other = events.subscribe(foreignId, (event) => foreign.push(event));
    try {
      const session = await telemetry.startSharing(proof, {
        consent: true,
        expectedRevision: 0,
      });
      const tracking = await telemetry.accept(proof, sample(session.sessionId));
      expect(tracking).toMatchObject({
        revision: 2,
        sharing: true,
        location: { latitude: 31.9, speed: 4, heading: 90 },
      });
      expect(received).toHaveLength(2);
      expect(foreign).toEqual([]);
      expect(JSON.stringify(received)).not.toContain(session.sessionId);
      expect((await repository.snapshot(actor)).drivers[0].tracking).toEqual(
        tracking,
      );
      expect(
        await prisma.LocationEvent.where({ workerId: driverId }).all(),
      ).toEqual([]);
    } finally {
      unsubscribe();
      other();
    }
  });
  it('rejects duplicates/out of order/frequency/jumps without replacing the last point', async () => {
    const session = await telemetry.startSharing(proof, {
      consent: true,
      expectedRevision: 0,
    });
    const input = sample(session.sessionId);
    await telemetry.accept(proof, input);
    await expect(telemetry.accept(proof, input)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      telemetry.accept(proof, {
        ...input,
        sequence: 2,
        capturedAt: new Date(Date.now() + 1).toISOString(),
      }),
    ).rejects.toMatchObject({ status: 429 });
    await prisma.DriverTrackingState.where({ workerId: driverId }).update({
      receivedAt: Temporal.Instant.fromEpochMilliseconds(Date.now() - 5000),
      capturedAt: Temporal.Instant.fromEpochMilliseconds(Date.now() - 5000),
    });
    await expect(
      telemetry.accept(proof, {
        ...sample(session.sessionId),
        sequence: 2,
        latitude: 40,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await prisma.DriverTrackingState.where({ workerId: driverId }).first())
        ?.latitude,
    ).toBe(31.9);
  });
  it('stops sharing without erasing last known coordinates; old session cannot resume after new consent', async () => {
    const first = await telemetry.startSharing(proof, {
      consent: true,
      expectedRevision: 0,
    });
    await telemetry.accept(proof, sample(first.sessionId));
    const stopped = await telemetry.stopSharing(proof, first.sessionId);
    expect(stopped).toMatchObject({
      sharing: false,
      revision: 3,
      location: { latitude: 31.9 },
    });
    const second = await telemetry.startSharing(proof, {
      consent: true,
      expectedRevision: 3,
    });
    expect(second.sessionId).not.toBe(first.sessionId);
    await expect(
      telemetry.accept(proof, { ...sample(first.sessionId), sequence: 2 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      telemetry.stopSharing(proof, first.sessionId),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('serializes concurrent HQ creates and sharing starts with exactly one winner', async () => {
    const heads = await Promise.allSettled([
      repository.saveHeadquarters(actor, {
        latitude: 31,
        longitude: 35,
        expectedRevision: 0,
      }),
      repository.saveHeadquarters(actor, {
        latitude: 32,
        longitude: 35,
        expectedRevision: 0,
      }),
    ]);
    expect(heads.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const starts = await Promise.allSettled([
      telemetry.startSharing(proof, { consent: true, expectedRevision: 0 }),
      telemetry.startSharing(proof, { consent: true, expectedRevision: 0 }),
    ]);
    expect(starts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.DriverTrackingState.where({ companyId }).all(),
    ).toHaveLength(1);
  });
  it('database constraints reject malformed GPS and headquarters without touching workers', async () => {
    await expect(
      prisma.CompanyHeadquarters.create({
        companyId,
        latitude: 91,
        longitude: 35,
      }),
    ).rejects.toThrow();
    const session = await telemetry.startSharing(proof, {
      consent: true,
      expectedRevision: 0,
    });
    await expect(
      prisma.DriverTrackingState.where({ workerId: driverId }).update({
        latitude: 31,
      }),
    ).rejects.toThrow();
    expect(
      (await prisma.Worker.where({ id: driverId }).first())?.vehicleId,
    ).toBe(vehicleId);
    await telemetry.stopSharing(proof, session.sessionId);
    const row = await prisma.DriverTrackingState.where({
      workerId: driverId,
    }).first();
    expect(row).not.toBeNull();
    await expect(
      prisma.DriverTrackingState.where({ workerId: driverId }).update({
        companyId: foreignId,
      }),
    ).rejects.toThrow();
  });
  it('reports an unapplied tracking table as unavailable using the actual ORM error', async () => {
    guard.assertVerified();
    const config = requireDisposableAuthTestDatabase(process.env);
    const db = new pg.Client({ connectionString: config.url });
    await db.connect();
    try {
      await db.query(
        'ALTER TABLE public.driver_tracking_states RENAME TO fleet_test_unavailable',
      );
      await expect(repository.snapshot(actor)).rejects.toMatchObject({
        status: 503,
      });
    } finally {
      await db.query(
        'ALTER TABLE public.fleet_test_unavailable RENAME TO driver_tracking_states',
      );
      await db.end();
    }
  });
  it('pins read authorization until snapshot completion, blocking concurrent revocation', async () => {
    let markValidated!: () => void;
    let releaseRead!: () => void;
    const validated = new Promise<void>((resolve) => {
      markValidated = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    class PausedRepository extends FleetRepository {
      override async validateActor(
        ...args: Parameters<FleetRepository['validateActor']>
      ) {
        await super.validateActor(...args);
        markValidated();
        await resume;
      }
    }
    const db = new pg.Client({
      connectionString: requireDisposableAuthTestDatabase(process.env).url,
    });
    await db.connect();
    const read = new PausedRepository(prisma).snapshot(actor);
    try {
      await validated;
      const revoke = db.query('UPDATE users SET role=$1 WHERE id=$2', [
        'MERCHANT',
        userId,
      ]);
      const inspect = new pg.Client({
        connectionString: requireDisposableAuthTestDatabase(process.env).url,
      });
      await inspect.connect();
      try {
        const deadline = Date.now() + 5000;
        let blocked = false;
        while (Date.now() < deadline) {
          const r = await inspect.query<{ n: number }>(
            "SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'",
          );
          if (r.rows[0]?.n) {
            blocked = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(blocked).toBe(true);
      } finally {
        releaseRead();
        await inspect.end();
      }
      expect((await read).drivers[0].id).toBe(driverId);
      await revoke;
      await expect(repository.snapshot(actor)).rejects.toMatchObject({
        status: 403,
      });
    } finally {
      releaseRead();
      await read.catch(() => {});
      await db.end();
    }
  });
  it('revalidates persisted writer identity after waiting for the company lock', async () => {
    const url = requireDisposableAuthTestDatabase(process.env).url;
    const blocker = new pg.Client({ connectionString: url });
    await blocker.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [
        companyId,
      ]);
      const pending = repository.saveHeadquarters(actor, {
        latitude: 31,
        longitude: 35,
        expectedRevision: 0,
      });
      // Wait for a real independent connection to block, not a timing-only sleep.
      const deadline = Date.now() + 5000;
      let waiting = false;
      while (Date.now() < deadline) {
        await blocker.query('SELECT pg_stat_clear_snapshot()');
        const result = await blocker.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'",
        );
        if (result.rows[0]?.count) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      await blocker.query('UPDATE users SET role=$1 WHERE id=$2', [
        'MERCHANT',
        userId,
      ]);
      await blocker.query('COMMIT');
      await expect(pending).rejects.toMatchObject({ status: 403 });
      expect(
        await prisma.CompanyHeadquarters.where({ companyId }).first(),
      ).toBeNull();
    } finally {
      await blocker.query('ROLLBACK');
      await blocker.end();
    }
  });
});
