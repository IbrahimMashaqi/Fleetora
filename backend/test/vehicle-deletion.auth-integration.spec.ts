import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { VehiclesRepository } from '../src/modules/vehicles/vehicles.repository.js';
import type { TokenPayload } from '../src/modules/auth/token/token.payload.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
  requireDisposableAuthTestDatabase,
} from './auth-postgres.safety.js';

// Opt-in through the EXISTING integration setup/guard. No dotenv or application
// URL is loaded: a verified loopback *_test database and role are mandatory.
const companyId = '71111111-1111-4111-8111-111111111111';
const otherCompanyId = '72222222-2222-4222-8222-222222222222';
const adminId = '73333333-3333-4333-8333-333333333333';
const vehicleId = '74444444-4444-4444-8444-444444444444';
const driverId = '75555555-5555-4555-8555-555555555555';
const foreignVehicleId = '76666666-6666-4666-8666-666666666666';
const actor: TokenPayload = {
  sub: adminId,
  orgId: companyId,
  role: 'COMPANY_ADMIN',
  email: 'vehicle-delete@example.invalid',
};

describe('vehicle deletion against disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  let prisma: PrismaService;
  let repository: VehiclesRepository;

  async function cleanup() {
    guard.assertVerified();
    await prisma.db
      .runtime()
      .execute(
        prisma.db.raw.sql`DELETE FROM public.vehicle_delete_test_dependencies`
          .affectedCount()
          .build(),
      );
    // Clear both fixture tenants' workers first: a test deliberately creates a
    // foreign-company FK reference, which must never be changed by remove().
    for (const id of [companyId, otherCompanyId])
      await prisma.Worker.where({ companyId: id }).delete();
    for (const id of [companyId, otherCompanyId]) {
      await prisma.Vehicle.where({ companyId: id }).delete();
      await prisma.User.where({ companyId: id }).delete();
      await prisma.Company.where({ id }).delete();
    }
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    repository = new VehiclesRepository(prisma);
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    // Test-only restrictive reference proves a failure AFTER unassignment rolls
    // back the entire repository transaction. No application schema is changed.
    await prisma.db.runtime().execute(
      prisma.db.raw.sql`
      CREATE TABLE IF NOT EXISTS public.vehicle_delete_test_dependencies (
        id text PRIMARY KEY, "vehicleId" text NOT NULL REFERENCES public.vehicles(id)
      )`
        .affectedCount()
        .build(),
    );
  });

  beforeEach(async () => {
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    await cleanup();
    for (const id of [companyId, otherCompanyId])
      await prisma.Company.create({
        id,
        name: 'Fictional deletion test',
        plan: 'TRIAL',
        suspended: false,
      });
    await prisma.User.create({
      id: adminId,
      companyId,
      role: 'COMPANY_ADMIN',
      fullName: 'Fictional Administrator',
      email: actor.email,
      password: await bcrypt.hash(randomBytes(32).toString('hex'), 4),
      isActive: true,
      isEmailVerified: true,
    });
    await prisma.Vehicle.create({
      id: vehicleId,
      companyId,
      type: 'CAR',
      plateNumber: 'DELETE-TEST',
    });
    await prisma.Vehicle.create({
      id: foreignVehicleId,
      companyId: otherCompanyId,
      type: 'VAN',
      plateNumber: 'FOREIGN-TEST',
    });
    await prisma.Worker.create({
      id: driverId,
      companyId,
      fullName: 'Fictional Driver',
      phone: '+0000000000',
      status: 'OFFLINE',
    });
  });

  afterAll(async () => {
    await guard.teardown(
      async () => {
        await guard.verify(() => readAuthPostgresIdentity(prisma));
        await cleanup();
        await prisma.db
          .runtime()
          .execute(
            prisma.db.raw
              .sql`DROP TABLE public.vehicle_delete_test_dependencies`
              .affectedCount()
              .build(),
          );
      },
      async () => {
        await prisma?.db.close();
      },
    );
  });

  it('physically deletes only the unassigned company vehicle', async () => {
    await repository.remove(actor, vehicleId);
    expect(await prisma.Vehicle.where({ id: vehicleId }).first()).toBeNull();
    expect(
      await prisma.Vehicle.where({ id: foreignVehicleId }).first(),
    ).not.toBeNull();
    expect(await prisma.Worker.where({ id: driverId }).first()).not.toBeNull();
  });

  it('deletes an assigned vehicle while preserving the full driver record and unrelated assignments', async () => {
    await prisma.Worker.where({ id: driverId }).update({ vehicleId });
    const before = await prisma.Worker.where({ id: driverId })
      .select('id', 'fullName', 'phone', 'status', 'successRate')
      .first();
    await repository.remove(actor, vehicleId);
    const after = await prisma.Worker.where({ id: driverId })
      .select('id', 'fullName', 'phone', 'status', 'successRate', 'vehicleId')
      .first();
    expect(after).toEqual({ ...before, vehicleId: null });
    expect(await prisma.Vehicle.where({ id: vehicleId }).first()).toBeNull();
  });

  it.each([foreignVehicleId, '77777777-7777-4777-8777-777777777777'])(
    'returns 404 for foreign or nonexistent %s',
    async (id) => {
      await expect(repository.remove(actor, id)).rejects.toMatchObject({
        status: 404,
      });
      expect(
        await prisma.Vehicle.where({ id: vehicleId }).first(),
      ).not.toBeNull();
      expect(
        await prisma.Vehicle.where({ id: foreignVehicleId }).first(),
      ).not.toBeNull();
    },
  );

  it('rechecks the persisted role despite a company-admin principal', async () => {
    await prisma.User.where({ id: adminId }).update({ role: 'MERCHANT' });
    await expect(repository.remove(actor, vehicleId)).rejects.toMatchObject({
      status: 403,
    });
    expect(
      await prisma.Vehicle.where({ id: vehicleId }).first(),
    ).not.toBeNull();
  });

  it('rolls back unassignment when a restrictive FK prevents deletion', async () => {
    await prisma.Worker.where({ id: driverId }).update({ vehicleId });
    await prisma.db.runtime().execute(
      prisma.db.raw.sql`
      INSERT INTO public.vehicle_delete_test_dependencies VALUES ('dependency', ${vehicleId})`
        .affectedCount()
        .build(),
    );
    await expect(repository.remove(actor, vehicleId)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      await prisma.Worker.where({ id: driverId }).select('vehicleId').first(),
    ).toEqual({ vehicleId });
    expect(
      await prisma.Vehicle.where({ id: vehicleId }).first(),
    ).not.toBeNull();
  });

  it('never unassigns a foreign-company worker even if an external write created a bad reference', async () => {
    await prisma.Worker.where({ id: driverId }).update({
      companyId: otherCompanyId,
      vehicleId,
    });
    await expect(repository.remove(actor, vehicleId)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      await prisma.Worker.where({ id: driverId })
        .select('companyId', 'vehicleId')
        .first(),
    ).toEqual({ companyId: otherCompanyId, vehicleId });
    expect(
      await prisma.Vehicle.where({ id: vehicleId }).first(),
    ).not.toBeNull();
  });

  it.each(['assignment-first', 'deletion-first'])(
    'serializes real concurrent connections: %s',
    async (order) => {
      const settings = requireDisposableAuthTestDatabase(process.env);
      const blocker = new pg.Client({ connectionString: settings.url });
      const operations: Promise<void>[] = [];
      await blocker.connect();
      try {
        const identity = await blocker.query(
          'SELECT current_database() AS db, current_user AS role, session_user AS session',
        );
        expect(identity.rows).toEqual([
          {
            db: settings.databaseName,
            role: settings.roleName,
            session: settings.roleName,
          },
        ]);
        await blocker.query('BEGIN');
        await blocker.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [
          companyId,
        ]);
        async function waitForBlocked(count: number) {
          for (let i = 0; i < 100; i++) {
            // The blocker is inside a transaction; refresh its statistics
            // snapshot so a newly opened second pool connection is visible.
            await blocker.query('SELECT pg_stat_clear_snapshot()');
            const pending = await blocker.query<{ total: number }>(
              "SELECT count(*)::int AS total FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND wait_event_type='Lock'",
            );
            if (pending.rows[0].total >= count) return;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          throw new Error(
            'Expected independent PostgreSQL connections to block on the company lock',
          );
        }
        const assign = () =>
          repository.assign(actor, driverId, {
            vehicleId,
            expectedVehicleId: null,
          });
        const remove = () => repository.remove(actor, vehicleId);
        const first = order === 'assignment-first' ? assign : remove;
        const second = order === 'assignment-first' ? remove : assign;
        operations.push(first());
        void operations[0].catch(() => {});
        await waitForBlocked(1);
        operations.push(second());
        void operations[1].catch(() => {});
        await waitForBlocked(2);
        await blocker.query('COMMIT');
        const results = await Promise.allSettled(operations);
        if (order === 'assignment-first')
          expect(results.map((result) => result.status)).toEqual([
            'fulfilled',
            'fulfilled',
          ]);
        else
          expect(results).toMatchObject([
            { status: 'fulfilled' },
            { status: 'rejected', reason: { status: 404 } },
          ]);
        expect(
          await prisma.Vehicle.where({ id: vehicleId }).first(),
        ).toBeNull();
        expect(
          await prisma.Worker.where({ id: driverId })
            .select('id', 'vehicleId')
            .first(),
        ).toEqual({ id: driverId, vehicleId: null });
      } finally {
        await blocker.query('ROLLBACK').catch(() => {});
        await Promise.allSettled(operations);
        await blocker.end();
      }
    },
  );
});
