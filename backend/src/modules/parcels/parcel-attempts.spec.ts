import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { ParcelOperationsRepository } from './parcel-operations.repository.js';
import { ParcelStore } from './parcel-store.js';
import { ParcelLedger } from './parcel-ledger.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
describe('delivery outcome entry points', () => {
  it.each([
    'transition-delivered',
    'transition-failed',
    'attempt-delivered',
    'attempt-failed',
  ])('%s records exactly one attempt', async (path) => {
    const actor: TokenPayload = {
      sub: 'actor',
      orgId: 'company',
      role: 'COMPANY_ADMIN',
      email: 'fixture@example.invalid',
    };
    const parcel = {
      id: 'parcel',
      companyId: actor.orgId,
      revision: 1,
      status: 'OUT_FOR_DELIVERY',
      workerId: 'driver',
      attemptCount: 0,
    };
    const attempts: object[] = [];
    const shipment = {
      where() {
        return this;
      },
      async first() {
        return parcel;
      },
      async update(input: object) {
        Object.assign(parcel, input);
        return parcel;
      },
    };
    const tx = {
      orm: {
        public: {
          Shipment: shipment,
          ParcelAttempt: {
            async create(input: object) {
              attempts.push(input);
              return input;
            },
          },
        },
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        ParcelOperationsRepository,
        { provide: ParcelLedger, useValue: {} },
        {
          provide: ParcelStore,
          useValue: {
            async write(
              _actor: unknown,
              _capability: unknown,
              operation: (tx: object, companyId: string) => Promise<unknown>,
            ) {
              return operation(tx, actor.orgId);
            },
          },
        },
      ],
    }).compile();
    const operations = module.get(ParcelOperationsRepository);
    const changed = vi
      .spyOn(operations, 'change')
      .mockImplementation(async (_tx, _actor, row, target) => {
        Object.assign(parcel, { status: target });
        return row;
      });
    vi.spyOn(operations, 'parcelResult').mockResolvedValue({
      companyId: actor.orgId,
      parcel: {},
    });
    const failed = path.endsWith('failed');
    if (path.startsWith('transition'))
      await operations.transition(actor, parcel.id, {
        revision: 1,
        status: failed ? 'FAILED_DELIVERY' : 'DELIVERED',
        note: failed ? 'Recipient unreachable' : undefined,
      });
    else
      await operations.attempt(actor, parcel.id, {
        revision: 1,
        outcome: failed ? 'FAILED' : 'DELIVERED',
        reason: failed ? 'Recipient unreachable' : undefined,
      });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      outcome: failed ? 'FAILED' : 'DELIVERED',
      actorId: actor.sub,
      shipmentId: parcel.id,
    });
    expect(parcel.attemptCount).toBe(1);
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
