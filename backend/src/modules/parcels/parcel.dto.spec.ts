import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  MerchantInputDto,
  PageDto,
  ParcelInputDto,
  PaymentDto,
  ReturnInputDto,
} from './parcel.dto.js';
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
});
