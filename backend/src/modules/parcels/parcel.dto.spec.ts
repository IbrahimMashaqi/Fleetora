import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  MerchantInputDto,
  PageDto,
  ParcelEditDto,
  ParcelInputDto,
  PaymentDto,
  ReturnInputDto,
  TransitionDto,
} from './parcel.dto.js';
import {
  BUCKETS,
  STATUS_BUCKETS,
  TRANSITIONS,
  statusBuckets,
} from './parcel-domain.js';
import { parcelValidation, expectedCompany } from './parcel-http.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
const merchant = {
  name: ' Shop ',
  contactName: ' Contact ',
  phone: '+97000000000',
  pickupAddress: ' Address ',
  city: ' City ',
  currency: 'JOD',
  deliveryFee: '1.100',
  returnFee: '0.500',
  serviceFee: '0.000',
  feePayer: 'MERCHANT',
};
describe('parcel input contracts', () => {
  it('normalizes merchant inputs without treating the business as a login account', async () => {
    const result = await parcelValidation.transform(merchant, {
      type: 'body',
      metatype: MerchantInputDto,
    });
    expect(result.name).toBe('Shop');
    expect(result).not.toHaveProperty('password');
  });
  it.each(['companyId', 'role', 'status', 'deliveryFeeMinor', 'password'])(
    'rejects unauthorized merchant field %s',
    async (field) => {
      await expect(
        parcelValidation.transform(
          { ...merchant, [field]: 'injected' },
          { type: 'body', metatype: MerchantInputDto },
        ),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
  it('requires complete new parcel data and rejects arbitrary lifecycle fields', async () => {
    expect(
      await validate(plainToInstance(ParcelInputDto, {})),
    ).not.toHaveLength(0);
    await expect(
      parcelValidation.transform(
        {
          merchantId: '71111111-1111-4111-8111-111111111111',
          recipientName: 'Recipient',
          recipientPhone: '0000000',
          city: 'City',
          destination: 'Address',
          description: 'Goods',
          pieces: 1,
          codAmount: '10.00',
          status: 'DELIVERED',
        },
        { type: 'body', metatype: ParcelInputDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it.each([0, -1, 101, 100000000])(
    'rejects oversized or invalid list page size %s',
    async (size) => {
      expect(
        await validate(plainToInstance(PageDto, { pageSize: size })),
      ).not.toHaveLength(0);
    },
  );
  it('accepts bounded reason/merchant/date filters and transforms query booleans', async () => {
    const query = await parcelValidation.transform(
      {
        page: '2',
        pageSize: '50',
        remitted: 'false',
        reason: 'ATTEMPTS_EXHAUSTED',
      },
      { type: 'query', metatype: PageDto },
    );
    expect(query).toMatchObject({
      page: 2,
      pageSize: 50,
      remitted: false,
      reason: 'ATTEMPTS_EXHAUSTED',
    });
  });
  it('requires revision, structured return reason and payment audit reference', async () => {
    expect(
      await validate(
        plainToInstance(ReturnInputDto, {
          parcelId: 'invalid',
          reason: 'UNEXPLAINED',
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(PaymentDto, {
          amount: '12.00',
          method: 'CASH',
          revision: 2,
          paidAt: '2026-01-01T00:00:00Z',
          idempotencyKey: '1234567890123456',
        }),
      ),
    ).not.toHaveLength(0);
  });
  it('rejects stale or missing company context on every write', () => {
    const actor: TokenPayload = {
      sub: 'actor',
      orgId: 'tenant-a',
      email: 'fixture@example.invalid',
      role: 'COMPANY_ADMIN',
    };
    expect(() => expectedCompany(actor, undefined)).toThrow();
    expect(() => expectedCompany(actor, 'tenant-b')).toThrow();
    expect(() => expectedCompany(actor, 'tenant-a')).not.toThrow();
  });
  describe('D1 staff parcel contract', () => {
    const priced = {
      merchantId: '71111111-1111-4111-8111-111111111111',
      zoneId: '72222222-2222-4222-8222-222222222222',
      finalCustomerAmount: '150.00',
      pricingVersion: 'a'.repeat(64),
      collectionMode: 'COD',
      recipientName: 'Recipient',
      recipientPhone: '0000000',
      destination: 'Address',
      description: 'Goods',
      pieces: 1,
    };
    it('accepts a zone-priced body and never a staff-typed fee or city', async () => {
      const result = await parcelValidation.transform(priced, {
        type: 'body',
        metatype: ParcelInputDto,
      });
      expect(result).toMatchObject({ zoneId: priced.zoneId, collectionMode: 'COD' });
      for (const field of ['codAmount', 'city', 'deliveryFee', 'feePayer'])
        await expect(
          parcelValidation.transform(
            { ...priced, [field]: '10.00' },
            { type: 'body', metatype: ParcelInputDto },
          ),
        ).rejects.toMatchObject({ status: 400 });
    });
    it.each(['NORMAL', 'HIGH', 'URGENT'])(
      'OD-10/BR-083: accepts priority %s',
      async (priority) => {
        await expect(
          parcelValidation.transform(
            { ...priced, priority },
            { type: 'body', metatype: ParcelInputDto },
          ),
        ).resolves.toMatchObject({ priority });
      },
    );
    it.each(['LOW', 'low', 'normal', 'CRITICAL', ''])(
      'OD-10/BR-083: rejects priority %s on create and edit',
      async (priority) => {
        for (const [metatype, extra] of [
          [ParcelInputDto, {}],
          [ParcelEditDto, { revision: 1 }],
        ] as const) {
          // The same body without priority is valid, so the rejection is the priority.
          await expect(
            parcelValidation.transform(
              { ...priced, ...extra },
              { type: 'body', metatype },
            ),
          ).resolves.toBeDefined();
          await expect(
            parcelValidation.transform(
              { ...priced, ...extra, priority },
              { type: 'body', metatype },
            ),
          ).rejects.toMatchObject({ status: 400 });
        }
      },
    );
    it.each(['zoneId', 'finalCustomerAmount', 'pricingVersion', 'collectionMode'])(
      'requires %s, so no legacy-shaped parcel can be created',
      async (field) => {
        const body: Record<string, unknown> = { ...priced };
        delete body[field];
        await expect(
          parcelValidation.transform(body, { type: 'body', metatype: ParcelInputDto }),
        ).rejects.toMatchObject({ status: 400 });
      },
    );
    it('rejects malformed amounts and pricing versions', async () => {
      for (const patch of [
        { finalCustomerAmount: 150 },
        { finalCustomerAmount: '-1.00' },
        { pricingVersion: 'stale' },
        { collectionMode: 'LATER' },
      ])
        await expect(
          parcelValidation.transform(
            { ...priced, ...patch },
            { type: 'body', metatype: ParcelInputDto },
          ),
        ).rejects.toMatchObject({ status: 400 });
    });
  });
  describe('receiving transitions', () => {
    it.each(['RECEIVED_FROM_MERCHANT', 'AT_WAREHOUSE'])(
      'require a warehouse UUID for %s',
      async (status) => {
        expect(
          await validate(plainToInstance(TransitionDto, { revision: 1, status })),
        ).not.toHaveLength(0);
        expect(
          await validate(
            plainToInstance(TransitionDto, { revision: 1, status, warehouseId: 'x' }),
          ),
        ).not.toHaveLength(0);
        expect(
          await validate(
            plainToInstance(TransitionDto, {
              revision: 1,
              status,
              warehouseId: '73333333-3333-4333-8333-333333333333',
            }),
          ),
        ).toHaveLength(0);
      },
    );
    it('does not ask for a warehouse on other transitions', async () => {
      expect(
        await validate(
          plainToInstance(TransitionDto, { revision: 1, status: 'CANCELLED' }),
        ),
      ).toHaveLength(0);
    });
  });
  describe('dashboard buckets', () => {
    it('place every parcel status in exactly one bucket', () => {
      for (const status of Object.keys(TRANSITIONS))
        expect(
          BUCKETS.filter((bucket) => STATUS_BUCKETS[bucket].includes(status)),
          status,
        ).toHaveLength(1);
    });
    it('add up to the total for any distribution', () => {
      const distribution = Object.keys(TRANSITIONS).map((status, index) => ({
        status,
        count: index + 1,
      }));
      const total = distribution.reduce((sum, row) => sum + row.count, 0);
      const buckets = statusBuckets(distribution);
      expect(Object.values(buckets).reduce((sum, n) => sum + n, 0)).toBe(total);
      expect(
        statusBuckets([
          { status: 'CREATED', count: 6 },
          { status: 'RECEIVED_FROM_MERCHANT', count: 1 },
          { status: 'CANCELLED', count: 2 },
        ]),
      ).toMatchObject({ new: 6, atWarehouse: 1, cancelled: 2, delivered: 0 });
    });
  });
});
