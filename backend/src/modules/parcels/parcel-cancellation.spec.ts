import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ParcelFinanceRepository } from './parcel-finance.repository.js';
import { ParcelStore } from './parcel-store.js';
import { ParcelLedger } from './parcel-ledger.js';
import type { TokenPayload } from '../auth/token/token.payload.js';

describe('settlement cancellation reservation release', () => {
  it('releases every matching reservation and retains audit lines and unrelated reservations', async () => {
    const actor: TokenPayload = {
      sub: 'actor',
      orgId: 'company-a',
      role: 'COMPANY_ADMIN',
      email: 'fixture@example.invalid',
    };
    const settlement = {
      id: 'settlement-a',
      companyId: actor.orgId,
      currency: 'ILS',
      status: 'DRAFT',
      revision: 1,
    };
    const lines = [
      {
        id: 'goods-line',
        ledgerEntryId: 'goods',
        amountMinor: 10000n,
        kind: 'GOODS',
      },
      {
        id: 'fee-line',
        ledgerEntryId: 'fee',
        amountMinor: -1700n,
        kind: 'DELIVERY_FEE',
      },
    ];
    let reservations = [
      { id: 'goods', companyId: actor.orgId, settlementId: settlement.id },
      { id: 'fee', companyId: actor.orgId, settlementId: settlement.id },
      {
        id: 'other-settlement',
        companyId: actor.orgId,
        settlementId: 'settlement-b',
      },
      {
        id: 'other-company',
        companyId: 'company-b',
        settlementId: settlement.id,
      },
    ];
    const settlementQuery = {
      where() {
        return this;
      },
      include() {
        return this;
      },
      async first() {
        return { ...settlement, lines, payments: [] };
      },
      async update(input: object) {
        Object.assign(settlement, input);
        return settlement;
      },
    };
    const allocations = {
      where(filter: { companyId: string; settlementId: string }) {
        const matches = (row: (typeof reservations)[number]) =>
          row.companyId === filter.companyId &&
          row.settlementId === filter.settlementId;
        return {
          async delete() {
            const first = reservations.find(matches);
            reservations = reservations.filter((row) => row !== first);
          },
          async deleteAll() {
            reservations = reservations.filter((row) => !matches(row));
          },
        };
      },
    };
    const tx = {
      orm: {
        public: {
          MerchantSettlement: settlementQuery,
          SettlementAllocation: allocations,
        },
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        ParcelFinanceRepository,
        { provide: ParcelLedger, useValue: {} },
        {
          provide: ParcelStore,
          useValue: {
            orm: { MerchantSettlement: settlementQuery },
            async monetary(
              _actor: unknown,
              _capability: unknown,
              _key: unknown,
              _action: unknown,
              _input: unknown,
              operation: (tx: object, companyId: string) => Promise<string>,
            ) {
              return operation(tx, actor.orgId);
            },
          },
        },
      ],
    }).compile();
    const response = await module
      .get(ParcelFinanceRepository)
      .cancel(actor, settlement.id, {
        revision: 1,
        reason: 'Approved cancellation',
        idempotencyKey: 'fixture-idempotency-key',
      });
    expect(reservations).toEqual([
      {
        id: 'other-settlement',
        companyId: actor.orgId,
        settlementId: 'settlement-b',
      },
      {
        id: 'other-company',
        companyId: 'company-b',
        settlementId: settlement.id,
      },
    ]);
    expect(response.settlement.status).toBe('CANCELLED');
    expect(response.settlement.lines).toMatchObject([
      { id: 'goods-line', amount: '100.00' },
      { id: 'fee-line', amount: '-17.00' },
    ]);
  });
});
