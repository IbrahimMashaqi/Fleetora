import { Test } from '@nestjs/testing';
import postgres from '@prisma/orm-postgres/runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Contract } from '../../prisma/generated/contract.d';
import contractJson from '../../prisma/generated/contract.json' with { type: 'json' };
import { PrismaService } from '../prisma/prisma.service.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { ParcelStore } from './parcel-store.js';
describe('parcel transaction authorization and idempotency', () => {
  const raw = postgres<Contract>({ contractJson }).raw;
  const actor: TokenPayload = {
    sub: 'actor',
    orgId: 'company',
    role: 'COMPANY_ADMIN',
    email: 'fixture@example.invalid',
  };
  let user = {
    id: actor.sub,
    companyId: actor.orgId,
    role: 'COMPANY_ADMIN',
    isActive: true,
    isEmailVerified: true,
  };
  let tenant: { id: string; suspended: boolean } | null = {
    id: actor.orgId,
    suspended: false,
  };
  let stored: {
    companyId: string;
    key: string;
    payloadHash: string;
    resultId: string;
  } | null;
  let effects: number, transactions: number;
  const locks: string[] = [];
  let store: ParcelStore;
  function row<T>(value: () => T) {
    return {
      where() {
        return this;
      },
      select() {
        return this;
      },
      async first() {
        return value();
      },
    };
  }
  beforeEach(async () => {
    user = {
      id: actor.sub,
      companyId: actor.orgId,
      role: 'COMPANY_ADMIN',
      isActive: true,
      isEmailVerified: true,
    };
    tenant = { id: actor.orgId, suspended: false };
    stored = null;
    effects = 0;
    transactions = 0;
    locks.length = 0;
    const tx = {
      async execute(plan: { ast: unknown }) {
        locks.push(JSON.stringify(plan.ast));
        return 1;
      },
      orm: {
        public: {
          User: row(() => user),
          Company: row(() => tenant),
          MonetaryRequest: {
            ...row(() => stored),
            async create(input: NonNullable<typeof stored>) {
              stored = input;
              return input;
            },
          },
        },
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        ParcelStore,
        {
          provide: PrismaService,
          useValue: {
            db: {
              raw,
              async transaction(operation: (tx: object) => unknown) {
                transactions++;
                return operation(tx);
              },
            },
          },
        },
      ],
    }).compile();
    store = module.get(ParcelStore);
  });
  it('locks company before actor and then performs an authorized effect', async () => {
    await store.write(actor, 'manageParcels', async () => {
      effects++;
    });
    expect(effects).toBe(1);
    expect(locks[0]).toContain('companies');
    expect(locks[1]).toContain('users');
  });
  it.each(['inactive', 'unverified', 'suspended', 'missingCompany'])(
    'rejects persisted %s before any effect',
    async (mode) => {
      if (mode === 'inactive') user.isActive = false;
      if (mode === 'unverified') user.isEmailVerified = false;
      if (mode === 'suspended' && tenant) tenant.suspended = true;
      if (mode === 'missingCompany') tenant = null;
      await expect(
        store.write(actor, 'manageParcels', async () => {
          effects++;
        }),
      ).rejects.toMatchObject({ status: 401 });
      expect(effects).toBe(0);
    },
  );
  it.each(['role', 'company'])(
    'rejects persisted %s changes despite the authenticated token',
    async (field) => {
      if (field === 'role') user.role = 'ACCOUNTANT';
      else user.companyId = 'other-company';
      await expect(
        store.write(actor, 'manageParcels', async () => {
          effects++;
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(effects).toBe(0);
    },
  );
  it('does not begin a transaction for an accountant operational mutation', async () => {
    await expect(
      store.write(
        { ...actor, role: 'ACCOUNTANT' },
        'manageParcels',
        async () => {
          effects++;
        },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(transactions).toBe(0);
  });
  it('accepts accountant financial work after verifying persisted role', async () => {
    user.role = 'ACCOUNTANT';
    await store.write({ ...actor, role: 'ACCOUNTANT' }, 'collect', async () => {
      effects++;
    });
    expect(effects).toBe(1);
  });
  it('returns the recorded result for identical retry and rejects altered amount or action', async () => {
    const input = { amount: '10.00', method: 'CASH' },
      key = 'fixture-idempotency-key';
    const effect = async () => {
      effects++;
      return 'result-id';
    };
    expect(
      await store.monetary(actor, 'collect', key, 'COLLECT', input, effect),
    ).toBe('result-id');
    expect(
      await store.monetary(
        actor,
        'collect',
        key,
        'COLLECT',
        { method: 'CASH', amount: '10.00' },
        effect,
      ),
    ).toBe('result-id');
    expect(effects).toBe(1);
    await expect(
      store.monetary(
        actor,
        'collect',
        key,
        'COLLECT',
        { ...input, amount: '11.00' },
        effect,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      store.monetary(actor, 'collect', key, 'REMIT', input, effect),
    ).rejects.toMatchObject({ status: 409 });
    expect(effects).toBe(1);
  });
  it('hides unexpected database diagnostics from public error messages', async () => {
    const failure = store.write(actor, 'collect', async () => {
      throw new Error('secret connection and recipient data');
    });
    await expect(failure).rejects.toMatchObject({
      status: 500,
      message: 'Operation could not be completed',
    });
  });
});
