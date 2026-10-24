import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { VehiclesRepository } from './vehicles.repository.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
type Row = Record<string, unknown>;
type Lock = { text: string; args: unknown[] };
const actor: TokenPayload = {
  sub: 'admin',
  email: 'admin@example.invalid',
  role: 'COMPANY_ADMIN',
  orgId: 'company-a',
};
let users: Row[],
  companies: Row[],
  workers: Row[],
  vehicles: Row[],
  locks: Lock[],
  updates: Row[];
let repository: VehiclesRepository;
function collection(rows: Row[]) {
  function query(filters: unknown[]) {
    const matches = () =>
      rows.filter((row) =>
        filters.every((filter) => {
          if (typeof filter === 'function') {
            const result: unknown = filter({
              plateNumber: { ilike: (pattern: string) => ({ plate: pattern }) },
            });
            return (
              !!result &&
              typeof result === 'object' &&
              'plate' in result &&
              String(row.plateNumber).toLowerCase() ===
                String(result.plate).toLowerCase()
            );
          }
          return (
            !!filter &&
            typeof filter === 'object' &&
            Object.entries(filter).every(([key, value]) => row[key] === value)
          );
        }),
      );
    return {
      where: (filter: unknown) => query([...filters, filter]),
      select: () => query(filters),
      first: async () => matches()[0] ?? null,
      delete: async () => {
        const selected = matches();
        if (
          selected.some((vehicle) =>
            workers.some((worker) => worker.vehicleId === vehicle.id),
          )
        )
          throw { sqlState: '23503' };
        for (const row of selected) rows.splice(rows.indexOf(row), 1);
      },
      update: async (changes: Row) => {
        for (const row of matches()) {
          if (
            changes.vehicleId &&
            workers.some(
              (other) =>
                other.id !== row.id && other.vehicleId === changes.vehicleId,
            )
          )
            throw { kind: 'sql_query', sqlState: '23505' };
          Object.assign(row, changes);
          updates.push(changes);
        }
      },
    };
  }
  return {
    where: (filter: unknown) => query([filter]),
    create: async (data: Row) => {
      const row = { id: 'new-vehicle', ...data };
      rows.push(row);
      return row;
    },
  };
}
describe('fleet mutation transaction workflow (isolated ORM fixture, no database)', () => {
  beforeEach(async () => {
    users = [
      {
        id: 'admin',
        role: 'COMPANY_ADMIN',
        companyId: 'company-a',
        isActive: true,
        isEmailVerified: true,
      },
    ];
    companies = [{ id: 'company-a', suspended: false }];
    workers = [
      { id: 'driver-a', companyId: 'company-a', vehicleId: null },
      { id: 'driver-b', companyId: 'company-a', vehicleId: null },
      { id: 'foreign-driver', companyId: 'company-b', vehicleId: null },
    ];
    vehicles = [
      { id: 'vehicle-a', companyId: 'company-a', plateNumber: 'ABC' },
      { id: 'vehicle-b', companyId: 'company-a', plateNumber: 'DEF' },
      { id: 'foreign-vehicle', companyId: 'company-b', plateNumber: 'SECRET' },
    ];
    locks = [];
    updates = [];
    let tail = Promise.resolve();
    const db = {
      raw: {
        sql: (parts: TemplateStringsArray, ...args: unknown[]) => ({
          returnsRow: () => ({
            build: () => ({ text: parts.join('?'), args }),
          }),
          affectedCount: () => ({
            build: () => ({ text: parts.join('?'), args }),
          }),
        }),
      },
      transaction: async (operation: (tx: unknown) => Promise<unknown>) => {
        let release: (() => void) | undefined;
        const tx = {
          query: async (plan: Lock) => {
            expect(plan.text).toContain('WHERE "companyId"=?');
            expect(plan.text).toContain(
              'upper(btrim("plateNumber")) = upper(btrim(?))',
            );
            return vehicles
              .filter(
                (row) =>
                  row.companyId === plan.args[0] &&
                  String(row.plateNumber).trim().toUpperCase() ===
                    String(plan.args[1]).trim().toUpperCase(),
              )
              .slice(0, 2)
              .map((row) => ({ id: row.id }));
          },
          execute: async (plan: Lock) => {
            locks.push(plan);
            if (plan.text.includes('companies')) {
              const prior = tail;
              tail = new Promise<void>((resolve) => {
                release = resolve;
              });
              await prior;
            }
          },
          orm: {
            public: {
              User: collection(users),
              Company: collection(companies),
              Worker: collection(workers),
              Vehicle: collection(vehicles),
            },
          },
        };
        try {
          return await operation(tx);
        } finally {
          release?.();
        }
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        VehiclesRepository,
        { provide: PrismaService, useValue: { db } },
      ],
    }).compile();
    repository = module.get(VehiclesRepository);
  });
  it('locks tenant, actor, driver and selected vehicle then assigns', async () => {
    await repository.assign(actor, 'driver-a', {
      vehicleId: 'vehicle-a',
      expectedVehicleId: null,
    });
    expect(workers[0].vehicleId).toBe('vehicle-a');
    expect(locks.map((lock) => lock.text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('companies'),
        expect.stringContaining('users'),
        expect.stringContaining('workers'),
        expect.stringContaining('vehicles'),
      ]),
    );
    expect(locks.every((lock) => lock.text.endsWith('FOR UPDATE'))).toBe(true);
    expect(locks[2].args).toEqual(['driver-a', 'company-a']);
    expect(locks[3].args).toEqual(['vehicle-a', 'company-a']);
  });
  it('changes and unassigns only the expected assignment', async () => {
    workers[0].vehicleId = 'vehicle-a';
    await repository.assign(actor, 'driver-a', {
      vehicleId: 'vehicle-b',
      expectedVehicleId: 'vehicle-a',
    });
    await repository.assign(actor, 'driver-a', {
      vehicleId: null,
      expectedVehicleId: 'vehicle-b',
    });
    expect(workers[0].vehicleId).toBeNull();
  });
  it('permanently deletes an unassigned company vehicle and preserves other vehicles', async () => {
    await repository.remove(actor, 'vehicle-a');
    expect(vehicles.map((row) => row.id)).toEqual([
      'vehicle-b',
      'foreign-vehicle',
    ]);
    expect(workers).toHaveLength(3);
    expect(locks[0].text).toContain('companies');
    expect(locks[1].text).toContain('users');
    expect(locks.at(-1)).toMatchObject({
      text: expect.stringContaining('FOR UPDATE'),
      args: ['vehicle-a', 'company-a'],
    });
  });
  it('unassigns the driver before deleting, preserving the driver and unrelated assignments', async () => {
    workers[0].vehicleId = 'vehicle-a';
    workers[1].vehicleId = 'vehicle-b';
    await repository.remove(actor, 'vehicle-a');
    expect(workers).toHaveLength(3);
    expect(workers[0]).toMatchObject({ id: 'driver-a', vehicleId: null });
    expect(workers[1].vehicleId).toBe('vehicle-b');
    expect(vehicles.some((row) => row.id === 'vehicle-a')).toBe(false);
  });
  it.each(['foreign-vehicle', 'missing'])(
    'hides deletion of %s without changing assignments',
    async (id) => {
      workers[0].vehicleId = 'vehicle-a';
      await expect(repository.remove(actor, id)).rejects.toMatchObject({
        status: 404,
      });
      expect(vehicles).toHaveLength(3);
      expect(updates).toHaveLength(0);
    },
  );
  it.each(['role', 'company', 'inactive', 'unverified', 'suspended'])(
    'revalidates persisted %s for deletion under the existing locks',
    async (change) => {
      if (change === 'role') users[0].role = 'MERCHANT';
      if (change === 'company') users[0].companyId = 'company-b';
      if (change === 'inactive') users[0].isActive = false;
      if (change === 'unverified') users[0].isEmailVerified = false;
      if (change === 'suspended') companies[0].suspended = true;
      await expect(repository.remove(actor, 'vehicle-a')).rejects.toMatchObject(
        {
          status: ['role', 'company'].includes(change) ? 403 : 401,
        },
      );
      expect(vehicles).toHaveLength(3);
      expect(updates).toHaveLength(0);
    },
  );
  it('serializes assignment then deletion and leaves the surviving driver unassigned', async () => {
    await Promise.all([
      repository.assign(actor, 'driver-a', {
        vehicleId: 'vehicle-a',
        expectedVehicleId: null,
      }),
      repository.remove(actor, 'vehicle-a'),
    ]);
    expect(workers[0].vehicleId).toBeNull();
    expect(workers).toHaveLength(3);
    expect(vehicles.some((row) => row.id === 'vehicle-a')).toBe(false);
  });
  it('serializes deletion before assignment and rejects the now-missing vehicle', async () => {
    const result = await Promise.allSettled([
      repository.remove(actor, 'vehicle-a'),
      repository.assign(actor, 'driver-a', {
        vehicleId: 'vehicle-a',
        expectedVehicleId: null,
      }),
    ]);
    expect(result[0].status).toBe('fulfilled');
    expect(result[1]).toMatchObject({
      status: 'rejected',
      reason: { status: 404 },
    });
    expect(workers[0].vehicleId).toBeNull();
  });
  it('rejects stale replacement and stale unassignment', async () => {
    workers[0].vehicleId = 'vehicle-a';
    await expect(
      repository.assign(actor, 'driver-a', {
        vehicleId: 'vehicle-b',
        expectedVehicleId: null,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      repository.assign(actor, 'driver-a', {
        vehicleId: null,
        expectedVehicleId: 'vehicle-b',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(updates).toHaveLength(0);
  });
  it('serializes competing assignments without stealing', async () => {
    const result = await Promise.allSettled([
      repository.assign(actor, 'driver-a', {
        vehicleId: 'vehicle-a',
        expectedVehicleId: null,
      }),
      repository.assign(actor, 'driver-b', {
        vehicleId: 'vehicle-a',
        expectedVehicleId: null,
      }),
    ]);
    expect(result.filter((value) => value.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(workers.filter((row) => row.vehicleId === 'vehicle-a')).toHaveLength(
      1,
    );
    const failure = result.find((value) => value.status === 'rejected');
    expect(failure).toMatchObject({
      status: 'rejected',
      reason: { status: 409 },
    });
  });
  it.each([
    ['foreign-driver', 'vehicle-a'],
    ['driver-a', 'foreign-vehicle'],
    ['missing', 'vehicle-a'],
    ['driver-a', 'missing'],
  ])(
    'hides cross-company or missing references %s/%s',
    async (driver, vehicle) => {
      await expect(
        repository.assign(actor, driver, {
          vehicleId: vehicle,
          expectedVehicleId: null,
        }),
      ).rejects.toMatchObject({ status: 404 });
      expect(updates).toHaveLength(0);
    },
  );
  it.each(['role', 'company', 'inactive', 'unverified', 'suspended'])(
    'rechecks %s after taking locks',
    async (change) => {
      if (change === 'role') users[0].role = 'MERCHANT';
      if (change === 'company') users[0].companyId = 'company-b';
      if (change === 'inactive') users[0].isActive = false;
      if (change === 'unverified') users[0].isEmailVerified = false;
      if (change === 'suspended') companies[0].suspended = true;
      await expect(
        repository.assign(actor, 'driver-a', {
          vehicleId: 'vehicle-a',
          expectedVehicleId: null,
        }),
      ).rejects.toMatchObject({
        status: ['role', 'company'].includes(change) ? 403 : 401,
      });
      expect(updates).toHaveLength(0);
    },
  );
  it('maps a database unique violation without leaking a foreign assignment', async () => {
    workers[2].vehicleId = 'vehicle-a';
    await expect(
      repository.assign(actor, 'driver-a', {
        vehicleId: 'vehicle-a',
        expectedVehicleId: null,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(workers[0].vehicleId).toBeNull();
  });
  it('creates within the persisted company and edits only own vehicles', async () => {
    const input = {
      manufacturer: 'BMW',
      model: '320i',
      type: 'CAR' as const,
      plateNumber: 'NEW',
    };
    expect(await repository.save(actor, input)).toBe('new-vehicle');
    expect(vehicles.at(-1)).toMatchObject({
      companyId: 'company-a',
      manufacturer: 'BMW',
    });
    await repository.save(
      actor,
      { ...input, plateNumber: 'EDIT' },
      'vehicle-a',
    );
    expect(vehicles[0].plateNumber).toBe('EDIT');
    await expect(
      repository.save(actor, input, 'foreign-vehicle'),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('rejects duplicate plates without revealing another company', async () => {
    const input = {
      manufacturer: null,
      model: null,
      type: 'CAR' as const,
      plateNumber: 'ABC',
    };
    await expect(repository.save(actor, input)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      repository.save(actor, { ...input, plateNumber: 'SECRET' }),
    ).resolves.toBe('new-vehicle');
  });
  it('rejects normalized duplicates of a whitespace-padded legacy plate on create and edit', async () => {
    vehicles[0].plateNumber = ' abc ';
    const input = {
      manufacturer: null,
      model: null,
      type: 'CAR' as const,
      plateNumber: 'ABC',
    };
    await expect(repository.save(actor, input)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      repository.save(actor, input, 'vehicle-b'),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('rejects a new known mismatched pair without writing', async () => {
    await expect(
      repository.save(actor, {
        manufacturer: 'Volkswagen',
        model: 'Corolla',
        type: 'CAR',
        plateNumber: 'NEW',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(vehicles).toHaveLength(3);
    expect(updates).toHaveLength(0);
  });
  it('preserves an unchanged legacy mismatch and raw alias on metadata edits', async () => {
    Object.assign(vehicles[0], { manufacturer: ' vw ', model: ' Corolla ' });
    await repository.save(
      actor,
      {
        manufacturer: 'Volkswagen',
        model: 'Corolla',
        type: 'VAN',
        plateNumber: 'ABC',
      },
      'vehicle-a',
    );
    expect(vehicles[0]).toMatchObject({
      manufacturer: ' vw ',
      model: ' Corolla ',
      type: 'VAN',
    });
    await expect(
      repository.save(
        actor,
        {
          manufacturer: 'BMW',
          model: 'Corolla',
          type: 'CAR',
          plateNumber: 'ABC',
        },
        'vehicle-a',
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it.each([
    { manufacturer: 'Toyota', model: 'Custom Shuttle' },
    { manufacturer: 'Legacy Motors', model: 'Corolla' },
    { manufacturer: null, model: null },
    { manufacturer: 'BMW', model: null },
  ])('allows custom and optional pair %j', async (pair) => {
    await repository.save(actor, { ...pair, type: 'CAR', plateNumber: 'NEW' });
    expect(vehicles.at(-1)).toMatchObject(pair);
  });
  it('keeps cross-company edits hidden before pair validation', async () => {
    await expect(
      repository.save(
        actor,
        {
          manufacturer: 'BMW',
          model: 'Corolla',
          type: 'CAR',
          plateNumber: 'ABC',
        },
        'foreign-vehicle',
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(updates).toHaveLength(0);
  });
  it('preserves whitespace-only legacy identity on unrelated edits', async () => {
    Object.assign(vehicles[0], { manufacturer: '  ', model: '  ' });
    await repository.save(
      actor,
      { manufacturer: null, model: null, type: 'VAN', plateNumber: 'ABC' },
      'vehicle-a',
    );
    expect(vehicles[0]).toMatchObject({
      manufacturer: '  ',
      model: '  ',
      type: 'VAN',
    });
  });
});
