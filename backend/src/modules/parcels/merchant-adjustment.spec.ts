import { Test } from '@nestjs/testing';
import postgres from '@prisma/orm-postgres/runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Contract } from '../../prisma/generated/contract.d';
import contractJson from '../../prisma/generated/contract.json' with { type: 'json' };
import { PrismaService } from '../prisma/prisma.service.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { ParcelFinanceRepository } from './parcel-finance.repository.js';
import { ParcelStore } from './parcel-store.js';
import { ParcelLedger } from './parcel-ledger.js';

// Real repository + transaction authorization; persistence is an in-memory double.
describe('OD-13/BR-093 adjustment activation gate', () => {
  const actor: TokenPayload = {
    sub: 'admin',
    orgId: 'company',
    role: 'COMPANY_ADMIN',
    email: 'admin@example.invalid',
  };
  const raw = postgres<Contract>({ contractJson }).raw;
  let activationStatus: string;
  let entries: Array<Record<string, unknown>>;
  let requests: Array<{ key: string; payloadHash: string; resultId: string }>;
  let finance: ParcelFinanceRepository;
  function row<T>(get: (filter: Record<string, unknown>) => T) {
    return {
      where(filter: Record<string, unknown>) {
        return {
          select() {
            return this;
          },
          async first() {
            return get(filter);
          },
        };
      },
    };
  }
  beforeEach(async () => {
    activationStatus = 'PENDING';
    entries = [];
    requests = [];
    const orm = {
      User: row(() => ({
        id: actor.sub,
        companyId: actor.orgId,
        role: actor.role,
        isActive: true,
        isEmailVerified: true,
      })),
      Company: row(() => ({
        id: actor.orgId,
        suspended: false,
        currency: 'ILS',
      })),
      Merchant: row((filter) =>
        filter.companyId === actor.orgId && filter.id === 'merchant'
          ? { id: 'merchant', activationStatus }
          : null,
      ),
      MerchantLedgerEntry: {
        ...row((filter) =>
          entries.find(
            (entry) =>
              entry.id === filter.id && entry.companyId === filter.companyId,
          ),
        ),
        async create(input: Record<string, unknown>) {
          const entry = { ...input, id: `entry-${entries.length}` };
          entries.push(entry);
          return entry;
        },
      },
      MonetaryRequest: {
        ...row((filter) =>
          requests.find((request) => request.key === filter.key),
        ),
        async create(input: (typeof requests)[number]) {
          requests.push(input);
          return input;
        },
      },
    };
    const tx = {
      orm: { public: orm },
      async execute() {
        return 1;
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        ParcelFinanceRepository,
        ParcelStore,
        { provide: ParcelLedger, useValue: {} },
        {
          provide: PrismaService,
          useValue: {
            db: {
              raw,
              orm: { public: orm },
              async transaction(operation: (value: object) => unknown) {
                return operation(tx);
              },
            },
          },
        },
      ],
    }).compile();
    finance = module.get(ParcelFinanceRepository);
  });
  const input = (amount = '10.00', idempotencyKey = 'adjustment-key') => ({
    merchantId: 'merchant',
    amount,
    reason: 'Correction',
    idempotencyKey,
  });
  it.each(['10.00', '-10.00'])(
    'rejects PENDING adjustment %s without ledger or idempotency writes',
    async (amount) => {
      await expect(
        finance.adjustment(actor, input(amount)),
      ).rejects.toMatchObject({ status: 409 });
      expect(entries).toHaveLength(0);
      expect(requests).toHaveLength(0);
    },
  );
  it('rejects both simultaneous PENDING submissions without posting money', async () => {
    const results = await Promise.allSettled([
      finance.adjustment(actor, input('10.00', 'first-key')),
      finance.adjustment(actor, input('-10.00', 'second-key')),
    ]);
    expect(results).toEqual([
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ status: 409 }),
      }),
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ status: 409 }),
      }),
    ]);
    expect(entries).toHaveLength(0);
    expect(requests).toHaveLength(0);
  });
  it('allows the rejected request after activation and keeps retries idempotent', async () => {
    await expect(finance.adjustment(actor, input())).rejects.toMatchObject({
      status: 409,
    });
    activationStatus = 'ACTIVE';
    const result = await finance.adjustment(actor, input());
    expect(result.entry).toMatchObject({
      amount: '10.00',
      currency: 'ILS',
      kind: 'ADJUSTMENT',
    });
    expect(await finance.adjustment(actor, input())).toEqual(result);
    expect(entries).toHaveLength(1);
    expect(requests).toHaveLength(1);
  });
  it('preserves permission rejection for merchant users', async () => {
    await expect(
      finance.adjustment({ ...actor, role: 'MERCHANT' }, input()),
    ).rejects.toMatchObject({ status: 403 });
    expect(entries).toHaveLength(0);
  });
  it.each(['PENDING', 'ACTIVE'])(
    'rejects a foreign merchant without exposing its %s status',
    async (status) => {
      activationStatus = status;
      await expect(
        finance.adjustment(actor, {
          ...input(),
          merchantId: 'foreign-merchant',
        }),
      ).rejects.toMatchObject({ status: 404 });
      expect(entries).toHaveLength(0);
    },
  );
});
