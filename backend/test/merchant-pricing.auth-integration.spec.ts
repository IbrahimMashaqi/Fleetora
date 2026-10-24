import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { ParcelStore } from '../src/modules/parcels/parcel-store.js';
import type { TokenPayload } from '../src/modules/auth/token/token.payload.js';
import { MerchantPricingRepository } from '../src/modules/merchant-pricing/merchant-pricing.repository.js';
import { MerchantPricingService } from '../src/modules/merchant-pricing/merchant-pricing.service.js';
import { PricingPageDto } from '../src/modules/merchant-pricing/merchant-pricing.dto.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';

describe('merchant commercial pricing on disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  const fixtureCompanies: string[] = [];
  let prisma: PrismaService;
  let store: ParcelStore;
  let pricing: MerchantPricingService;
  let actor: TokenPayload;
  let foreign: TokenPayload;

  async function identity(): Promise<TokenPayload> {
    const company = await prisma.Company.create({
      name: 'Isolated pricing fixture',
    });
    fixtureCompanies.push(company.id);
    const user = await prisma.User.create({
      companyId: company.id,
      fullName: 'Pricing administrator fixture',
      password: randomUUID(),
      email: `${randomUUID()}@example.invalid`,
      role: 'COMPANY_ADMIN',
      isActive: true,
      isEmailVerified: true,
    });
    return {
      sub: user.id,
      orgId: company.id,
      email: user.email ?? '',
      role: 'COMPANY_ADMIN',
    };
  }
  async function contract(who = actor) {
    const zone = (
      await pricing.saveZone(who, {
        name: 'Fixture locality',
        city: 'Fixture city',
        baseFee: '15',
        currency: 'ILS',
      })
    ).zone;
    const plan = (
      await pricing.savePlan(who, {
        name: 'Fixture commercial terms',
        currency: 'ILS',
      })
    ).plan;
    if (!plan) throw new Error('Expected persisted plan');
    const merchant = await prisma.db.orm.public.Merchant.create({
      companyId: who.orgId,
      name: 'Fixture merchant',
      contactName: 'Fixture owner',
      phone: '+000000000',
      pickupAddress: 'Fixture pickup',
      city: 'Fixture city',
      currency: 'ILS',
      deliveryFeeMinor: 0n,
      returnFeeMinor: 0n,
      serviceFeeMinor: 0n,
      feePayer: 'MERCHANT',
    });
    await pricing.assignPlan(who, merchant.id, {
      planId: plan.id,
      revision: merchant.revision,
      discountAmount: '0',
    });
    return { zone, plan, merchant };
  }
  async function saveSnapshot(
    merchantId: string,
    zoneId: string,
    finalAmount = '150',
  ) {
    return store.write(actor, 'manageParcels', async (tx, companyId) => {
      const quoted = await pricing.quote(
        companyId,
        merchantId,
        zoneId,
        finalAmount,
        tx,
      );
      const shipment = await tx.orm.public.Shipment.create({
        companyId,
        merchantId,
        requestedBy: actor.sub,
        destination: 'Fixture recipient address',
        collectionMode: quoted.snapshot.codMinor === 0n ? 'PREPAID' : 'COD',
        ...quoted.snapshot,
      });
      return { shipment, quoted };
    });
  }
  beforeAll(async () => {
    prisma = new PrismaService();
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    store = new ParcelStore(prisma);
    pricing = new MerchantPricingService(new MerchantPricingRepository(store));
  });
  beforeEach(async () => {
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    actor = await identity();
    foreign = await identity();
  });
  afterAll(async () => {
    await guard.teardown(
      async () => {
        await guard.verify(() => readAuthPostgresIdentity(prisma));
        for (const companyId of fixtureCompanies) {
          await prisma.Shipment.where({ companyId }).deleteAll();
          await prisma.db.orm.public.Merchant.where({ companyId }).deleteAll();
          await prisma.db.orm.public.PlanZoneTariff.where({
            companyId,
          }).deleteAll();
          await prisma.db.orm.public.MerchantPlan.where({
            companyId,
          }).deleteAll();
          await prisma.db.orm.public.DeliveryZone.where({
            companyId,
          }).deleteAll();
          await prisma.User.where({ companyId }).deleteAll();
          await prisma.Company.where({ id: companyId }).delete();
        }
      },
      async () => {
        await prisma?.db.close();
      },
    );
  });

  it('persists final150/fee15 as collect150/proceeds135 with an immutable fee snapshot', async () => {
    const { merchant, zone } = await contract();
    const { shipment, quoted } = await saveSnapshot(merchant.id, zone.id);
    expect(quoted.preview).toMatchObject({
      finalCustomerAmount: '150.00',
      deliveryFee: '15.00',
      expectedMerchantProceeds: '135.00',
    });
    expect(shipment).toMatchObject({
      pricingMode: 'FINAL_INCLUSIVE',
      codMinor: 15000n,
      deliveryFeeMinor: 1500n,
      baseDeliveryFeeMinor: 1500n,
      feePayer: 'MERCHANT',
      serviceFeeMinor: 0n,
    });
    await pricing.saveZone(
      actor,
      {
        name: zone.name,
        city: zone.city,
        currency: zone.currency,
        baseFee: '20',
        revision: zone.revision,
      },
      zone.id,
    );
    const next = await pricing.quote(actor.orgId, merchant.id, zone.id, '150');
    expect(next.preview.deliveryFee).toBe('20.00');
    expect(next.preview.pricingVersion).not.toBe(quoted.preview.pricingVersion);
    const persisted = await prisma.Shipment.where({
      id: shipment.id,
      companyId: actor.orgId,
    }).first();
    expect(persisted?.deliveryFeeMinor).toBe(1500n);
    expect(persisted?.pricingPlanVersion).toBe(quoted.preview.pricingVersion);
  });
  it('preserves a prepaid zero collection and the merchant delivery charge', async () => {
    const { merchant, zone } = await contract();
    const { shipment, quoted } = await saveSnapshot(merchant.id, zone.id, '0');
    expect(shipment.codMinor).toBe(0n);
    expect(shipment.deliveryFeeMinor).toBe(1500n);
    expect(quoted.preview.expectedMerchantProceeds).toBe('-15.00');
    expect(
      await prisma.db.orm.public.CodCollection.where({
        shipmentId: shipment.id,
        companyId: actor.orgId,
      }).first(),
    ).toBeNull();
  });
  it('applies explicit tariff, merchant discount and named promotion without floating point', async () => {
    const { merchant, zone, plan } = await contract();
    await pricing.saveTariff(actor, plan.id, zone.id, {
      revision: plan.revision,
      fee: '17.25',
      discount: '1.10',
      promotionDiscount: '0.15',
      promotionLabel: 'Fixture approved offer',
    });
    await pricing.assignPlan(actor, merchant.id, {
      planId: plan.id,
      revision: merchant.revision + 1,
      discountAmount: '1',
    });
    const result = await pricing.quote(
      actor.orgId,
      merchant.id,
      zone.id,
      '150.01',
    );
    expect(result.preview).toMatchObject({
      finalCustomerAmount: '150.01',
      baseDeliveryFee: '17.25',
      discount: '2.10',
      promotionDiscount: '0.15',
      deliveryFee: '15.00',
      expectedMerchantProceeds: '135.01',
      promotionLabel: 'Fixture approved offer',
    });
    expect((await pricing.planDetails(actor, plan.id)).plan.revision).toBe(2);
  });
  it('isolates lists and rejects foreign zone, merchant and plan relationships', async () => {
    const own = await contract();
    const other = await contract(foreign);
    expect(
      (await pricing.zones(actor, new PricingPageDto())).items.map(
        (row) => row.id,
      ),
    ).toEqual([own.zone.id]);
    expect(
      (await pricing.plans(actor, new PricingPageDto())).items.map(
        (row) => row.id,
      ),
    ).toEqual([own.plan.id]);
    await expect(
      pricing.quote(actor.orgId, other.merchant.id, own.zone.id, '150'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      pricing.quote(actor.orgId, own.merchant.id, other.zone.id, '150'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      pricing.assignPlan(actor, own.merchant.id, {
        planId: other.plan.id,
        revision: 2,
        discountAmount: '0',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      pricing.saveTariff(actor, own.plan.id, other.zone.id, {
        revision: 1,
        fee: '15',
        discount: '0',
        promotionDiscount: '0',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      prisma.db.orm.public.Merchant.where({
        companyId: actor.orgId,
        id: own.merchant.id,
      }).update({ planId: other.plan.id }),
    ).rejects.toBeDefined();
  });
  it('rechecks persisted actor role, activity and trusted tenant before administration', async () => {
    const own = await contract();
    await expect(
      pricing.saveZone(
        { ...actor, orgId: foreign.orgId },
        { name: 'Rejected', city: 'Rejected', baseFee: '1', currency: 'ILS' },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(() =>
      pricing.savePlan(
        { ...actor, role: 'PLATFORM_ADMIN' },
        { name: 'Rejected', currency: 'ILS' },
      ),
    ).toThrow(expect.objectContaining({ status: 403 }));
    await prisma.User.where({ id: actor.sub }).update({ isActive: false });
    await expect(
      pricing.assignPlan(actor, own.merchant.id, {
        planId: own.plan.id,
        revision: 2,
        discountAmount: '0',
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('rolls back invalid promotions and rejects stale revisions without changing configured terms', async () => {
    const { plan, zone } = await contract();
    await expect(
      pricing.saveTariff(actor, plan.id, zone.id, {
        revision: 1,
        fee: '15',
        discount: '0',
        promotionDiscount: '1',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect((await pricing.planDetails(actor, plan.id)).plan.revision).toBe(1);
    await pricing.saveTariff(actor, plan.id, zone.id, {
      revision: 1,
      fee: '15',
      discount: '0',
      promotionDiscount: '0',
    });
    await expect(
      pricing.saveTariff(actor, plan.id, zone.id, {
        revision: 1,
        fee: '99',
        discount: '0',
        promotionDiscount: '0',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await pricing.planDetails(actor, plan.id)).tariffs[0].fee).toBe(
      '15.00',
    );
  });
  it('serializes quote confirmation and concurrent tariff edits on the company lock', async () => {
    const { merchant, zone } = await contract();
    let startUpdate: (() => void) | undefined;
    const updateReady = new Promise<void>((resolve) => {
      startUpdate = resolve;
    });
    let releaseQuote: (() => void) | undefined;
    const mayRelease = new Promise<void>((resolve) => {
      releaseQuote = resolve;
    });
    const confirmation = store.write(
      actor,
      'manageParcels',
      async (tx, companyId) => {
        const result = await pricing.quote(
          companyId,
          merchant.id,
          zone.id,
          '150',
          tx,
        );
        startUpdate?.();
        await mayRelease;
        return tx.orm.public.Shipment.create({
          companyId,
          merchantId: merchant.id,
          requestedBy: actor.sub,
          destination: 'Fixture address',
          ...result.snapshot,
        });
      },
    );
    await updateReady;
    const mutation = pricing.saveZone(
      actor,
      {
        name: zone.name,
        city: zone.city,
        baseFee: '20',
        currency: 'ILS',
        revision: 1,
      },
      zone.id,
    );
    try {
      expect(
        await Promise.race([
          mutation.then(() => 'updated'),
          new Promise<string>((resolve) =>
            setTimeout(() => resolve('blocked'), 50),
          ),
        ]),
      ).toBe('blocked');
    } finally {
      releaseQuote?.();
    }
    expect((await confirmation).deliveryFeeMinor).toBe(1500n);
    await mutation;
    expect(
      (await pricing.quote(actor.orgId, merchant.id, zone.id, '150')).snapshot
        .deliveryFeeMinor,
    ).toBe(2000n);
  });
});
