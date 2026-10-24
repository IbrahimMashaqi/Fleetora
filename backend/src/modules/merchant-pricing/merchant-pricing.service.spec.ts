import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { MerchantPricingService } from './merchant-pricing.service.js';
import { MerchantPricingRepository } from './merchant-pricing.repository.js';

describe('company pricing orchestration', () => {
  const actor: TokenPayload = {
    sub: 'actor',
    orgId: 'company-a',
    role: 'COMPANY_ADMIN',
    email: 'test@example.invalid',
  };
  const merchant = {
    id: 'merchant',
    companyId: 'company-a',
    planId: 'plan',
    currency: 'ILS',
    active: true,
    revision: 1,
    pricingDiscountMinor: 0n,
  };
  const zone = {
    id: 'zone',
    companyId: 'company-a',
    name: 'Configured neighborhood',
    city: 'Configured city',
    currency: 'ILS',
    baseFeeMinor: 1500n,
    active: true,
    revision: 1,
  };
  const plan = {
    id: 'plan',
    companyId: 'company-a',
    name: 'Configured contract',
    currency: 'ILS',
    active: true,
    revision: 1,
  };
  const repository = {
    write: vi.fn(
      async (
        _actor: unknown,
        operation: (tx: object, company: string) => unknown,
      ) => operation({}, actor.orgId),
    ),
    readQuote: vi.fn(async (operation: (tx: object) => unknown) =>
      operation({}),
    ),
    lockCompany: vi.fn(async () => {}),
    merchant: vi.fn(async () => merchant),
    zone: vi.fn(async () => zone),
    plan: vi.fn(async () => plan),
    tariff: vi.fn(async () => null),
    assignPlan: vi.fn(),
    saveTariff: vi.fn(),
  };
  let service: MerchantPricingService;
  beforeEach(async () => {
    vi.clearAllMocks();
    repository.merchant.mockResolvedValue({ ...merchant });
    repository.zone.mockResolvedValue({ ...zone });
    repository.plan.mockResolvedValue({ ...plan });
    repository.tariff.mockResolvedValue(null);
    const module = await Test.createTestingModule({
      providers: [
        MerchantPricingService,
        { provide: MerchantPricingRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(MerchantPricingService);
  });
  it('quotes final-inclusive amounts and preserves a typed immutable parcel snapshot', async () => {
    const result = await service.quote(actor.orgId, 'merchant', 'zone', '150');
    expect(result.preview).toMatchObject({
      finalCustomerAmount: '150.00',
      deliveryFee: '15.00',
      expectedMerchantProceeds: '135.00',
      currency: 'ILS',
    });
    expect(result.snapshot).toMatchObject({
      pricingMode: 'FINAL_INCLUSIVE',
      codMinor: 15000n,
      feePayer: 'MERCHANT',
      serviceFeeMinor: 0n,
      deliveryFeeMinor: 1500n,
    });
    expect(repository.lockCompany).toHaveBeenCalledWith(
      expect.anything(),
      'company-a',
    );
    expect(repository.merchant).toHaveBeenCalledWith(
      expect.anything(),
      'company-a',
      'merchant',
    );
    expect(repository.zone).toHaveBeenCalledWith(
      expect.anything(),
      'company-a',
      'zone',
    );
  });
  it('represents a zero collection with a contractual merchant debt', async () => {
    expect(
      (await service.quote(actor.orgId, 'merchant', 'zone', '0')).preview
        .expectedMerchantProceeds,
    ).toBe('-15.00');
  });
  it.each(['PLATFORM_ADMIN', 'ACCOUNTANT', 'MERCHANT'] as const)(
    'rejects %s pricing management before persistence',
    async (role) => {
      expect(() =>
        service.preview(
          { ...actor, role },
          {
            merchantId: 'merchant',
            zoneId: 'zone',
            finalCustomerAmount: '150',
          },
        ),
      ).toThrow(expect.objectContaining({ status: 403 }));
      expect(repository.write).not.toHaveBeenCalled();
    },
  );
  it('rejects an absent trusted company context', async () => {
    await expect(
      service.quote('', 'merchant', 'zone', '150'),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('rejects a foreign merchant, zone or plan rather than using foreign pricing', async () => {
    repository.merchant.mockResolvedValueOnce({
      ...merchant,
      companyId: 'company-b',
    });
    await expect(
      service.quote(actor.orgId, 'merchant', 'zone', '150'),
    ).rejects.toMatchObject({ status: 404 });
    repository.zone.mockResolvedValueOnce({ ...zone, companyId: 'company-b' });
    await expect(
      service.quote(actor.orgId, 'merchant', 'zone', '150'),
    ).rejects.toMatchObject({ status: 404 });
    repository.plan.mockResolvedValueOnce({ ...plan, companyId: 'company-b' });
    await expect(
      service.quote(actor.orgId, 'merchant', 'zone', '150'),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('requires configured active commercial terms instead of a fake default price', async () => {
    repository.zone.mockResolvedValueOnce({ ...zone, active: false });
    await expect(
      service.quote(actor.orgId, 'merchant', 'zone', '150'),
    ).rejects.toMatchObject({ status: 400 });
    repository.plan.mockResolvedValueOnce({ ...plan, active: false });
    await expect(
      service.quote(actor.orgId, 'merchant', 'zone', '150'),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('invalidates preview tokens after a fee revision and leaves the original snapshot intact', async () => {
    const before = await service.quote(actor.orgId, 'merchant', 'zone', '150');
    repository.zone.mockResolvedValue({
      ...zone,
      revision: 2,
      baseFeeMinor: 2000n,
    });
    const after = await service.quote(actor.orgId, 'merchant', 'zone', '150');
    expect(before.preview.pricingVersion).not.toBe(
      after.preview.pricingVersion,
    );
    expect(before.snapshot.deliveryFeeMinor).toBe(1500n);
    expect(after.snapshot.deliveryFeeMinor).toBe(2000n);
    expect(
      (await service.quote(actor.orgId, 'merchant', 'zone', '0')).preview
        .pricingVersion,
    ).not.toBe(after.preview.pricingVersion);
  });
  it('rejects a cross-company plan assignment before an update', async () => {
    repository.plan.mockResolvedValueOnce({ ...plan, companyId: 'company-b' });
    await expect(
      service.assignPlan(actor, 'merchant', {
        planId: 'plan',
        revision: 1,
        discountAmount: '0',
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.assignPlan).not.toHaveBeenCalled();
  });
  it('rejects stale merchant assignment revisions', async () => {
    await expect(
      service.assignPlan(actor, 'merchant', {
        planId: 'plan',
        revision: 2,
        discountAmount: '0',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(repository.assignPlan).not.toHaveBeenCalled();
  });
  it('rejects an unlabeled promotion before a tariff write', async () => {
    await expect(
      service.saveTariff(actor, 'plan', 'zone', {
        revision: 1,
        fee: '15',
        discount: '0',
        promotionDiscount: '1',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.saveTariff).not.toHaveBeenCalled();
  });
});
