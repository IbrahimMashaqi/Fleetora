import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import {
  WarehousesRepository,
  lockLinkableWarehouse,
} from '../src/modules/warehouses/warehouses.repository.js';
import { ListWarehousesDto } from '../src/modules/warehouses/dto/list-warehouses.dto.js';
import type { TokenPayload } from '../src/modules/auth/token/token.payload.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';

const companyId = '91111111-1111-4111-8111-111111111111';
const otherCompanyId = '92222222-2222-4222-8222-222222222222';
const adminId = '93333333-3333-4333-8333-333333333333';
const warehouseId = '94444444-4444-4444-8444-444444444444';
const foreignWarehouseId = '95555555-5555-4555-8555-555555555555';
const merchantId = '96666666-6666-4666-8666-666666666666';
const missingId = '97777777-7777-4777-8777-777777777777';
const actor: TokenPayload = {
  sub: adminId,
  orgId: companyId,
  role: 'COMPANY_ADMIN',
  email: 'warehouses@example.invalid',
};

function query(input: Partial<ListWarehousesDto> = {}): ListWarehousesDto {
  return Object.assign(new ListWarehousesDto(), input);
}

describe('warehouse administration against disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  let prisma: PrismaService;
  let repository: WarehousesRepository;

  async function cleanup() {
    guard.assertVerified();
    for (const id of [companyId, otherCompanyId]) {
      await prisma.db.orm.public.PickupRequest.where({ companyId: id }).delete();
      await prisma.db.orm.public.Merchant.where({ companyId: id }).delete();
      await prisma.Warehouse.where({ companyId: id }).delete();
      await prisma.User.where({ companyId: id }).delete();
      await prisma.Company.where({ id }).delete();
    }
  }
  const read = (id: string) =>
    prisma.Warehouse.where({ id })
      .select('id', 'companyId', 'name', 'address', 'archivedAt')
      .first();
  const linkable = (id: string, company = companyId) =>
    prisma.db.transaction((tx) => lockLinkableWarehouse(prisma, tx, id, company));
  const openPickup = (status: string) =>
    prisma.db.orm.public.PickupRequest.create({
      companyId,
      merchantId,
      method: 'WAREHOUSE_DROPOFF',
      status,
      pickupAddress: 'Fictional merchant street 1',
      warehouseId,
      createdBy: adminId,
    });

  // Proves the archive really queued behind the in-flight pickup transaction
  // (on the company or warehouse row lock, whichever it reaches first).
  async function waitForBlockedArchive() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const rows = await prisma.db.runtime().query(
        prisma.db.raw.sql`SELECT "pid" FROM pg_stat_activity WHERE "wait_event_type" = 'Lock' AND "query" LIKE '%FOR UPDATE%'`
          .returnsRow({ pid: 'pg/int4@1' })
          .build(),
      );
      if (rows.length > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Archive never waited for the pickup transaction');
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    repository = new WarehousesRepository(prisma);
    await guard.verify(() => readAuthPostgresIdentity(prisma));
  });

  beforeEach(async () => {
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    await cleanup();
    for (const id of [companyId, otherCompanyId])
      await prisma.Company.create({
        id,
        name: 'Fictional warehouses test',
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
    await prisma.Warehouse.create({
      id: warehouseId,
      companyId,
      name: 'Main Hub',
      address: 'Fictional industrial zone 4',
    });
    await prisma.Warehouse.create({
      id: foreignWarehouseId,
      companyId: otherCompanyId,
      name: 'Foreign Hub',
      address: 'Fictional foreign road 9',
    });
    await prisma.db.orm.public.Merchant.create({
      id: merchantId,
      companyId,
      name: 'Fictional Store',
      contactName: 'Fictional Contact',
      phone: '+0000000003',
      pickupAddress: 'Fictional merchant street 1',
      city: 'Fictional City',
      currency: 'ILS',
      deliveryFeeMinor: 1000n,
      returnFeeMinor: 0n,
      feePayer: 'MERCHANT',
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

  it('creates an active warehouse in the trusted company', async () => {
    const id = await repository.create(actor, {
      name: 'North Depot',
      address: 'Fictional north road 2',
    });
    expect(await read(id)).toEqual({
      id,
      companyId,
      name: 'North Depot',
      address: 'Fictional north road 2',
      archivedAt: null,
    });
  });

  it('lists only own warehouses, split by active and archived, with search', async () => {
    const second = await repository.create(actor, {
      name: 'Annex',
      address: 'Fictional side street 7',
    });
    await repository.setArchived(actor, second, true);
    const active = await repository.findPage(companyId, query());
    expect(active.map((row) => row.id)).toEqual([warehouseId]);
    const archived = await repository.findPage(
      companyId,
      query({ status: 'ARCHIVED' }),
    );
    expect(archived.map((row) => row.id)).toEqual([second]);
    expect(
      await repository.findPage(companyId, query({ search: 'industrial' })),
    ).toHaveLength(1);
    expect(
      await repository.findPage(companyId, query({ search: 'Foreign' })),
    ).toHaveLength(0);
    expect(
      await repository.findPage(companyId, query({ search: '%' })),
    ).toHaveLength(0);
  });

  it('edits name and address of an active own warehouse', async () => {
    await repository.update(actor, warehouseId, {
      name: 'Central Hub',
      address: 'Fictional central square 1',
    });
    expect(await read(warehouseId)).toMatchObject({
      name: 'Central Hub',
      address: 'Fictional central square 1',
      archivedAt: null,
    });
  });

  it('archives and restores idempotently, and refuses edits while archived', async () => {
    await repository.setArchived(actor, warehouseId, true);
    const archivedAt = (await read(warehouseId))?.archivedAt;
    expect(archivedAt).not.toBeNull();
    await repository.setArchived(actor, warehouseId, true);
    expect((await read(warehouseId))?.archivedAt).toEqual(archivedAt);
    await expect(
      repository.update(actor, warehouseId, {
        name: 'Edited While Archived',
        address: 'Fictional any street 1',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await read(warehouseId))?.name).toBe('Main Hub');
    await repository.setArchived(actor, warehouseId, false);
    expect((await read(warehouseId))?.archivedAt).toBeNull();
  });

  it('refuses to archive while an open pickup uses the warehouse', async () => {
    const pickup = await openPickup('CONFIRMED');
    await expect(
      repository.setArchived(actor, warehouseId, true),
    ).rejects.toMatchObject({ status: 409 });
    expect((await read(warehouseId))?.archivedAt).toBeNull();
    await prisma.db.orm.public.PickupRequest.where({ id: pickup.id }).update({
      status: 'CANCELLED',
    });
    await repository.setArchived(actor, warehouseId, true);
    expect((await read(warehouseId))?.archivedAt).not.toBeNull();
  });

  it('allows pickup links only to active warehouses of the same company', async () => {
    expect(await linkable(warehouseId)).toBe(true);
    expect(await linkable(foreignWarehouseId)).toBe(false);
    expect(await linkable(missingId)).toBe(false);
    await repository.setArchived(actor, warehouseId, true);
    expect(await linkable(warehouseId)).toBe(false);
  });

  it('makes a concurrent archive wait for an in-flight pickup link and then refuse', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const link = prisma.db.transaction(async (tx) => {
      expect(await lockLinkableWarehouse(prisma, tx, warehouseId, companyId)).toBe(true);
      await tx.orm.public.PickupRequest.create({
        companyId,
        merchantId,
        method: 'WAREHOUSE_DROPOFF',
        pickupAddress: 'Fictional merchant street 1',
        warehouseId,
        createdBy: adminId,
      });
      locked();
      await held;
    });
    await isLocked;
    const archive = repository.setArchived(actor, warehouseId, true);
    const outcome = archive.then(
      () => 'archived',
      (error: { status?: number }) => error.status,
    );
    try {
      await waitForBlockedArchive();
    } finally {
      release();
      await link;
    }
    expect(await outcome).toBe(409);
    expect((await read(warehouseId))?.archivedAt).toBeNull();
  });

  it.each([foreignWarehouseId, missingId])(
    'returns 404 and changes nothing for foreign or missing warehouse %s',
    async (id) => {
      const foreign = await read(foreignWarehouseId);
      await expect(
        repository.update(actor, id, {
          name: 'Hijack',
          address: 'Fictional hijack road',
        }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        repository.setArchived(actor, id, true),
      ).rejects.toMatchObject({ status: 404 });
      expect(await read(foreignWarehouseId)).toEqual(foreign);
      expect(await repository.findOne(companyId, foreignWarehouseId)).toBeNull();
    },
  );

  it('rechecks persisted role, account, and company state inside the write', async () => {
    const before = await read(warehouseId);
    await prisma.User.where({ id: adminId }).update({ role: 'MERCHANT' });
    await expect(
      repository.setArchived(actor, warehouseId, true),
    ).rejects.toMatchObject({ status: 403 });
    await prisma.User.where({ id: adminId }).update({
      role: 'COMPANY_ADMIN',
      companyId: otherCompanyId,
    });
    await expect(
      repository.create(actor, { name: 'Moved', address: 'Fictional road 1' }),
    ).rejects.toMatchObject({ status: 403 });
    await prisma.User.where({ id: adminId }).update({ companyId });
    await prisma.Company.where({ id: companyId }).update({ suspended: true });
    await expect(
      repository.update(actor, warehouseId, {
        name: 'Suspended',
        address: 'Fictional road 2',
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(await read(warehouseId)).toEqual(before);
    expect(await prisma.Warehouse.where({ companyId }).all()).toHaveLength(1);
  });
});
