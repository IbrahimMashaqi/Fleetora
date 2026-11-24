import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { DriversRepository } from '../src/modules/drivers/drivers.repository.js';
import type { TokenPayload } from '../src/modules/auth/token/token.payload.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';

// Driver records are company-owned Worker rows without login accounts.
const companyId = '81111111-1111-4111-8111-111111111111';
const otherCompanyId = '82222222-2222-4222-8222-222222222222';
const adminId = '83333333-3333-4333-8333-333333333333';
const driverId = '84444444-4444-4444-8444-444444444444';
const foreignDriverId = '85555555-5555-4555-8555-555555555555';
const actor: TokenPayload = {
  sub: adminId,
  orgId: companyId,
  role: 'COMPANY_ADMIN',
  email: 'driver-records@example.invalid',
};
const workerFields = [
  'id',
  'companyId',
  'fullName',
  'phone',
  'status',
  'vehicleId',
  'successRate',
] as const;

describe('driver record writes against disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  let prisma: PrismaService;
  let repository: DriversRepository;

  async function cleanup() {
    guard.assertVerified();
    for (const id of [companyId, otherCompanyId]) {
      await prisma.Worker.where({ companyId: id }).delete();
      await prisma.User.where({ companyId: id }).delete();
      await prisma.Company.where({ id }).delete();
    }
  }
  const read = (id: string) =>
    prisma.Worker.where({ id })
      .select(...workerFields)
      .first();

  beforeAll(async () => {
    prisma = new PrismaService();
    repository = new DriversRepository(prisma);
    await guard.verify(() => readAuthPostgresIdentity(prisma));
  });

  beforeEach(async () => {
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    await cleanup();
    for (const id of [companyId, otherCompanyId])
      await prisma.Company.create({
        id,
        name: 'Fictional driver records test',
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
    await prisma.Worker.create({
      id: driverId,
      companyId,
      fullName: 'Fictional Driver',
      phone: '+0000000001',
      status: 'ON_BREAK',
    });
    await prisma.Worker.create({
      id: foreignDriverId,
      companyId: otherCompanyId,
      fullName: 'Foreign Driver',
      phone: '+0000000002',
      status: 'ACTIVE',
    });
  });

  afterAll(async () => {
    await guard.teardown(
      async () => {
        await guard.verify(() => readAuthPostgresIdentity(prisma));
        await cleanup();
      },
      async () => {
        await prisma?.db.close();
      },
    );
  });

  it('creates an offline driver in the trusted company without a login account', async () => {
    const usersBefore = await prisma.User.where({ companyId }).all();
    const id = await repository.create(actor, {
      name: 'New Driver',
      phone: '+970599000123',
    });
    expect(await read(id)).toEqual({
      id,
      companyId,
      fullName: 'New Driver',
      phone: '+970599000123',
      status: 'OFFLINE',
      vehicleId: null,
      successRate: 0,
    });
    expect(await prisma.User.where({ companyId }).all()).toEqual(usersBefore);
  });

  it('edits only name and phone of an own driver', async () => {
    const before = await read(driverId);
    await repository.update(actor, driverId, {
      name: 'Renamed Driver',
      phone: '+970599000999',
    });
    expect(await read(driverId)).toEqual({
      ...before,
      fullName: 'Renamed Driver',
      phone: '+970599000999',
    });
  });

  it('suspends idempotently and reactivates to offline', async () => {
    await repository.setSuspended(actor, driverId, true);
    expect((await read(driverId))?.status).toBe('SUSPENDED');
    await repository.setSuspended(actor, driverId, true);
    expect((await read(driverId))?.status).toBe('SUSPENDED');
    await repository.setSuspended(actor, driverId, false);
    expect((await read(driverId))?.status).toBe('OFFLINE');
  });

  it('does not change an operational status when reactivating a non-suspended driver', async () => {
    await repository.setSuspended(actor, driverId, false);
    expect((await read(driverId))?.status).toBe('ON_BREAK');
  });

  it.each([foreignDriverId, '86666666-6666-4666-8666-666666666666'])(
    'returns 404 and changes nothing for foreign or missing driver %s',
    async (id) => {
      const foreign = await read(foreignDriverId);
      await expect(
        repository.update(actor, id, { name: 'Hijack', phone: '+1234567' }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        repository.setSuspended(actor, id, true),
      ).rejects.toMatchObject({ status: 404 });
      expect(await read(foreignDriverId)).toEqual(foreign);
    },
  );

  it('rechecks persisted role, account, and company state inside the write', async () => {
    const before = await read(driverId);
    await prisma.User.where({ id: adminId }).update({ role: 'MERCHANT' });
    await expect(
      repository.setSuspended(actor, driverId, true),
    ).rejects.toMatchObject({ status: 403 });
    await prisma.User.where({ id: adminId }).update({
      role: 'COMPANY_ADMIN',
      companyId: otherCompanyId,
    });
    await expect(
      repository.create(actor, { name: 'Moved Admin', phone: '+1234567' }),
    ).rejects.toMatchObject({ status: 403 });
    await prisma.User.where({ id: adminId }).update({ companyId });
    await prisma.Company.where({ id: companyId }).update({ suspended: true });
    await expect(
      repository.update(actor, driverId, {
        name: 'Suspended Company',
        phone: '+1234567',
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(await read(driverId)).toEqual(before);
    expect(await prisma.Worker.where({ companyId }).all()).toHaveLength(1);
    expect(
      await prisma.Worker.where({ companyId: otherCompanyId }).all(),
    ).toHaveLength(1);
  });
});
