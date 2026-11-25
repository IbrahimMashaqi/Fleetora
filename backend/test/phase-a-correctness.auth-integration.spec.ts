import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { ParcelStore, now } from '../src/modules/parcels/parcel-store.js';
import { ParcelLedger } from '../src/modules/parcels/parcel-ledger.js';
import { ParcelOperationsRepository } from '../src/modules/parcels/parcel-operations.repository.js';
import { ParcelFinanceRepository } from '../src/modules/parcels/parcel-finance.repository.js';
import { ParcelDashboardRepository } from '../src/modules/parcels/parcel-dashboard.repository.js';
import { PageDto } from '../src/modules/parcels/parcel.dto.js';
import { MerchantPricingRepository } from '../src/modules/merchant-pricing/merchant-pricing.repository.js';
import { MerchantPricingService } from '../src/modules/merchant-pricing/merchant-pricing.service.js';
import { MerchantPickupsService } from '../src/modules/merchant-portal/merchant-pickups.service.js';
import { MerchantPortalStore } from '../src/modules/merchant-portal/merchant-portal.store.js';
import { MerchantAccessService } from '../src/modules/merchant-access/merchant-access.service.js';
import { MerchantAccessRepository } from '../src/modules/merchant-access/merchant-access.repository.js';
import type { TokenPayload } from '../src/modules/auth/token/token.payload.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';

describe('phase A correctness on disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  let prisma: PrismaService,
    store: ParcelStore,
    ops: ParcelOperationsRepository,
    finance: ParcelFinanceRepository,
    dashboard: ParcelDashboardRepository,
    pickups: MerchantPickupsService;
  let actor: TokenPayload, foreign: TokenPayload;
  let driverId: string,
    suspendedDriverId: string,
    warehouseId: string,
    archivedWarehouseId: string,
    foreignWarehouseId: string,
    zoneId: string,
    merchantId: string;
  const companies: string[] = [];
  const key = () => randomUUID();
  const str = (value: unknown) => {
    if (typeof value !== 'string') throw new Error('Expected string');
    return value;
  };

  async function identity() {
    const company = await prisma.Company.create({ name: 'Phase A fixture' });
    companies.push(company.id);
    const user = await prisma.User.create({
      companyId: company.id,
      fullName: 'Phase A operator',
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
      role: 'COMPANY_ADMIN' as const,
    };
  }
  /** Merchant on a plan whose tariff for the zone nets 20 - 3 - 2 = 15.00. */
  async function pricedMerchant(who: TokenPayload) {
    const zone = await prisma.db.orm.public.DeliveryZone.create({
      companyId: who.orgId,
      name: 'Phase A zone',
      city: 'Phase A city',
      baseFeeMinor: 2500n,
      currency: 'ILS',
    });
    const plan = await prisma.db.orm.public.MerchantPlan.create({
      companyId: who.orgId,
      name: 'Phase A plan',
      currency: 'ILS',
    });
    await prisma.db.orm.public.PlanZoneTariff.create({
      companyId: who.orgId,
      planId: plan.id,
      zoneId: zone.id,
      feeMinor: 2000n,
      discountMinor: 300n,
      promotionDiscountMinor: 200n,
      promotionLabel: 'Phase A promo',
    });
    const merchant = await prisma.db.orm.public.Merchant.create({
      companyId: who.orgId,
      name: 'Phase A merchant',
      contactName: 'Phase A contact',
      phone: '+000000000',
      pickupAddress: 'Phase A pickup',
      city: 'Phase A city',
      currency: 'ILS',
      // Legacy terms are deliberately different so a legacy fallback is visible.
      deliveryFeeMinor: 9900n,
      returnFeeMinor: 500n,
      serviceFeeMinor: 200n,
      feePayer: 'CUSTOMER',
      planId: plan.id,
    });
    return { zoneId: zone.id, merchantId: merchant.id };
  }
  /** A parcel created before D1, stored with the merchant's legacy terms. */
  async function legacyParcel(feePayer: 'MERCHANT' | 'CUSTOMER') {
    const legacy = await prisma.db.orm.public.Merchant.create({
      companyId: actor.orgId,
      name: `Legacy merchant ${feePayer}`,
      contactName: 'Legacy contact',
      phone: '+000000000',
      pickupAddress: 'Legacy pickup',
      city: 'Legacy city',
      currency: 'ILS',
      deliveryFeeMinor: 1500n,
      returnFeeMinor: 500n,
      serviceFeeMinor: 200n,
      feePayer,
    });
    const parcel = await prisma.Shipment.create({
      companyId: actor.orgId,
      merchantId: legacy.id,
      requestedBy: actor.sub,
      trackingNumber: `FL-${randomUUID().replaceAll('-', '').toUpperCase()}`,
      recipientName: 'Legacy recipient',
      recipientPhone: '+000000000',
      city: 'Legacy city',
      destination: 'Legacy destination',
      description: 'Legacy goods',
      codMinor: 10000n,
      deliveryFeeMinor: 1500n,
      returnFeeMinor: 500n,
      serviceFeeMinor: 200n,
      currency: 'ILS',
      feePayer,
      locationLabel: 'Legacy pickup',
      locationSource: 'MERCHANT_ADDRESS',
      locationUpdatedAt: now(),
    });
    return { merchantId: legacy.id, id: parcel.id };
  }
  const revision = async (id: string) =>
    Number((await ops.details(actor, id)).parcel.revision);
  const move = async (id: string, status: string, warehouse?: string) =>
    ops.transition(actor, id, {
      revision: await revision(id),
      status,
      ...(warehouse ? { warehouseId: warehouse } : {}),
    });
  async function quoted(amount = '150.00') {
    return (
      await ops.quote(actor, { merchantId, zoneId, finalCustomerAmount: amount })
    ).quote;
  }
  async function stafParcel(amount = '150.00', mode: 'COD' | 'PREPAID' = 'COD') {
    const quote = await quoted(amount);
    return str(
      (
        await ops.saveParcel(actor, {
          merchantId,
          zoneId,
          finalCustomerAmount: amount,
          pricingVersion: quote.pricingVersion,
          collectionMode: mode,
          recipientName: 'Staff recipient',
          recipientPhone: '+000000000',
          destination: 'Staff destination',
          description: 'Staff goods',
          pieces: 1,
        })
      ).parcel.id,
    );
  }
  async function deliver(id: string) {
    await move(id, 'RECEIVED_FROM_MERCHANT', warehouseId);
    await ops.assignment(actor, id, {
      revision: await revision(id),
      workerId: driverId,
    });
    await move(id, 'OUT_FOR_DELIVERY');
    await ops.attempt(actor, id, {
      revision: await revision(id),
      outcome: 'DELIVERED',
    });
  }
  const page = (input: Partial<PageDto>) =>
    Object.assign(new PageDto(), input);

  beforeAll(async () => {
    prisma = new PrismaService();
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    store = new ParcelStore(prisma);
    const ledger = new ParcelLedger(store);
    const pricing = new MerchantPricingService(new MerchantPricingRepository(store));
    ops = new ParcelOperationsRepository(store, ledger, pricing);
    finance = new ParcelFinanceRepository(store, ledger);
    dashboard = new ParcelDashboardRepository(store);
    const access = new MerchantAccessService(
      new MerchantAccessRepository(prisma),
      new ConfigService({ SALT_ROUNDS: 4 }),
    );
    pickups = new MerchantPickupsService(
      new MerchantPortalStore(prisma, access),
      store,
    );
  });
  beforeEach(async () => {
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    actor = await identity();
    foreign = await identity();
    driverId = (
      await prisma.Worker.create({
        companyId: actor.orgId,
        fullName: 'Active driver',
        phone: '+000000001',
      })
    ).id;
    suspendedDriverId = (
      await prisma.Worker.create({
        companyId: actor.orgId,
        fullName: 'Suspended driver',
        phone: '+000000002',
        status: 'SUSPENDED',
      })
    ).id;
    warehouseId = (
      await prisma.Warehouse.create({
        companyId: actor.orgId,
        name: 'Phase A North Hub',
        address: 'Fixture road 1',
      })
    ).id;
    archivedWarehouseId = (
      await prisma.Warehouse.create({
        companyId: actor.orgId,
        name: 'Phase A Old Hub',
        address: 'Fixture road 2',
        archivedAt: now(),
      })
    ).id;
    foreignWarehouseId = (
      await prisma.Warehouse.create({
        companyId: foreign.orgId,
        name: 'Foreign Hub',
        address: 'Fixture road 3',
      })
    ).id;
    ({ zoneId, merchantId } = await pricedMerchant(actor));
  });
  afterAll(async () => {
    await guard.teardown(
      async () => {
        await guard.verify(() => readAuthPostgresIdentity(prisma));
        const orm = prisma.db.orm.public;
        for (const companyId of companies) {
          await orm.SettlementPayment.where({ companyId }).deleteAll();
          await orm.SettlementAllocation.where({ companyId }).deleteAll();
          await orm.MerchantSettlementLine.where({ companyId }).deleteAll();
          await orm.MerchantSettlement.where({ companyId }).deleteAll();
          await orm.MerchantLedgerEntry.where({ companyId, kind: 'REVERSAL' }).deleteAll();
          await orm.MerchantLedgerEntry.where({ companyId }).deleteAll();
          await orm.CashRemittance.where({ companyId }).deleteAll();
          await orm.CodCollection.where({ companyId }).deleteAll();
          await orm.ParcelAttempt.where({ companyId }).deleteAll();
          await orm.ParcelReturn.where({ companyId }).deleteAll();
          await orm.PickupParcel.where({ companyId }).deleteAll();
          await orm.PickupRequest.where({ companyId }).deleteAll();
          await orm.MerchantAccessEvent.where({ companyId }).deleteAll();
          await prisma.ShipmentHistory.where((h) =>
            h.shipment.some((s) => s.companyId.eq(companyId)),
          ).deleteAll();
          await prisma.Shipment.where({ companyId }).deleteAll();
          await orm.MonetaryRequest.where({ companyId }).deleteAll();
          await orm.Merchant.where({ companyId }).deleteAll();
          await orm.PlanZoneTariff.where({ companyId }).deleteAll();
          await orm.MerchantPlan.where({ companyId }).deleteAll();
          await orm.DeliveryZone.where({ companyId }).deleteAll();
          await prisma.Warehouse.where({ companyId }).deleteAll();
          await prisma.Worker.where({ companyId }).deleteAll();
          await prisma.User.where({ companyId }).deleteAll();
          await prisma.Company.where({ id: companyId }).delete();
        }
      },
      async () => {
        await prisma?.db.close();
      },
    );
  });

  describe('D1: staff parcels use the final-inclusive pricing engine', () => {
    it('quotes and stores 150 final / 15 fee, collects 150 and settles 135 to the merchant', async () => {
      expect(await quoted()).toMatchObject({
        finalCustomerAmount: '150.00',
        baseDeliveryFee: '20.00',
        discount: '3.00',
        promotionDiscount: '2.00',
        deliveryFee: '15.00',
        expectedMerchantProceeds: '135.00',
        feePayer: 'MERCHANT',
        city: 'Phase A city',
      });
      const id = await stafParcel();
      const row = await prisma.Shipment.where({ id }).first();
      expect(row).toMatchObject({
        pricingMode: 'FINAL_INCLUSIVE',
        deliveryZoneId: zoneId,
        codMinor: 15000n,
        deliveryFeeMinor: 1500n,
        serviceFeeMinor: 0n,
        feePayer: 'MERCHANT',
        collectionMode: 'COD',
        city: 'Phase A city',
      });
      const details = (await ops.details(actor, id)).parcel;
      expect(details).toMatchObject({
        codAmount: '150.00',
        deliveryFee: '15.00',
        expectedCustomerTotal: '150.00',
      });
      await deliver(id);
      const collection = await finance.collect(actor, {
        parcelId: id,
        amount: '150.00',
        method: 'CASH',
        idempotencyKey: key(),
      });
      await finance.remit(actor, str(collection.collection.id), {
        amount: '150.00',
        method: 'CASH',
        idempotencyKey: key(),
      });
      expect(
        (await finance.preview(actor, { merchantId, currency: 'ILS' })).preview,
      ).toMatchObject({
        grossCollected: '150.00',
        deliveryFees: '15.00',
        netPayable: '135.00',
      });
    });

    it('rejects a stale quote, a merchant without a plan and a foreign zone', async () => {
      await expect(
        ops.saveParcel(actor, {
          merchantId,
          zoneId,
          finalCustomerAmount: '150.00',
          pricingVersion: 'a'.repeat(64),
          collectionMode: 'COD',
          recipientName: 'R',
          recipientPhone: '+000000000',
          destination: 'D',
          description: 'G',
          pieces: 1,
        }),
      ).rejects.toMatchObject({ status: 409 });
      const other = await pricedMerchant(foreign);
      await expect(
        ops.quote(actor, {
          merchantId,
          zoneId: other.zoneId,
          finalCustomerAmount: '150.00',
        }),
      ).rejects.toMatchObject({ status: 404 });
      await prisma.db.orm.public.Merchant.where({ id: merchantId }).update({
        planId: null,
      });
      await expect(quoted()).rejects.toMatchObject({ status: 400 });
      expect(await prisma.Shipment.where({ companyId: actor.orgId }).all()).toEqual([]);
    });

    it('edits a new inclusive parcel through a fresh quote', async () => {
      const id = await stafParcel();
      const quote = await quoted('200.00');
      await ops.saveParcel(
        actor,
        {
          merchantId,
          zoneId,
          finalCustomerAmount: '200.00',
          pricingVersion: quote.pricingVersion,
          collectionMode: 'COD',
          recipientName: 'Edited recipient',
          recipientPhone: '+000000000',
          destination: 'Edited destination',
          description: 'Staff goods',
          pieces: 2,
          revision: await revision(id),
        },
        id,
      );
      expect(await prisma.Shipment.where({ id }).first()).toMatchObject({
        codMinor: 20000n,
        deliveryFeeMinor: 1500n,
        recipientName: 'Edited recipient',
        pricingMode: 'FINAL_INCLUSIVE',
      });
    });

    it('keeps legacy snapshots: legacy parcels read, settle and cannot be re-priced by edit', async () => {
      const legacy = await legacyParcel('MERCHANT');
      expect((await ops.details(actor, legacy.id)).parcel).toMatchObject({
        codAmount: '100.00',
        deliveryFee: '15.00',
        serviceFee: '2.00',
        expectedCustomerTotal: '100.00',
      });
      const quote = await quoted();
      await expect(
        ops.saveParcel(
          actor,
          {
            merchantId: legacy.merchantId,
            zoneId,
            finalCustomerAmount: '150.00',
            pricingVersion: quote.pricingVersion,
            collectionMode: 'COD',
            recipientName: 'R',
            recipientPhone: '+000000000',
            destination: 'D',
            description: 'G',
            pieces: 1,
            revision: await revision(legacy.id),
          },
          legacy.id,
        ),
      ).rejects.toMatchObject({ status: 409 });
      await deliver(legacy.id);
      const collection = await finance.collect(actor, {
        parcelId: legacy.id,
        amount: '100.00',
        method: 'CASH',
        idempotencyKey: key(),
      });
      await finance.remit(actor, str(collection.collection.id), {
        amount: '100.00',
        method: 'CASH',
        idempotencyKey: key(),
      });
      expect(
        (await finance.preview(actor, {
          merchantId: legacy.merchantId,
          currency: 'ILS',
        })).preview,
      ).toMatchObject({
        grossCollected: '100.00',
        deliveryFees: '17.00',
        netPayable: '83.00',
      });
      const customerPays = await legacyParcel('CUSTOMER');
      expect(
        (await ops.details(actor, customerPays.id)).parcel.expectedCustomerTotal,
      ).toBe('117.00');
    });
  });

  describe('suspended drivers', () => {
    it('are excluded from the eligible driver list and rejected for pickups and assignment', async () => {
      const eligible = await ops.drivers(actor, page({ active: true }));
      expect(eligible.items.map((d) => d.id)).toEqual([driverId]);
      const all = await ops.drivers(actor, page({}));
      expect(all.items.map((d) => d.id).sort()).toEqual(
        [driverId, suspendedDriverId].sort(),
      );
      const pickup = await prisma.db.orm.public.PickupRequest.create({
        companyId: actor.orgId,
        merchantId,
        method: 'COMPANY_PICKUP',
        status: 'REQUESTED',
        pickupAddress: 'Phase A pickup',
        createdBy: actor.sub,
      });
      const window = {
        from: new Date(Date.now() + 86_400_000).toISOString(),
        to: new Date(Date.now() + 90_000_000).toISOString(),
      };
      await expect(
        pickups.review(actor, pickup.id, {
          revision: pickup.revision,
          action: 'CONFIRM',
          workerId: suspendedDriverId,
          ...window,
        }),
      ).rejects.toMatchObject({ status: 404 });
      await pickups.review(actor, pickup.id, {
        revision: pickup.revision,
        action: 'CONFIRM',
        workerId: driverId,
        ...window,
      });
      const id = await stafParcel();
      await move(id, 'RECEIVED_FROM_MERCHANT', warehouseId);
      await expect(
        ops.assignment(actor, id, {
          revision: await revision(id),
          workerId: suspendedDriverId,
        }),
      ).rejects.toBeDefined();
    });
  });

  describe('COD collection eligibility', () => {
    it('lists only delivered, uncollected parcels that have something to collect', async () => {
      const created = await stafParcel();
      const prepaid = await stafParcel('0.00', 'PREPAID');
      const done = await stafParcel();
      const collectedId = await stafParcel();
      await deliver(prepaid);
      await deliver(done);
      await deliver(collectedId);
      await finance.collect(actor, {
        parcelId: collectedId,
        amount: '150.00',
        method: 'CASH',
        idempotencyKey: key(),
      });
      const list = await ops.parcels(actor, page({ collectable: true }));
      expect(list.items.map((p) => p.id)).toEqual([done]);
      await expect(
        finance.collect(actor, {
          parcelId: created,
          amount: '150.00',
          method: 'CASH',
          idempotencyKey: key(),
        }),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Only delivered parcels can be collected',
      });
      await expect(
        finance.collect(actor, {
          parcelId: collectedId,
          amount: '150.00',
          method: 'CASH',
          idempotencyKey: key(),
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('receiving into a warehouse', () => {
    it('requires an active own warehouse and shows its name as the location', async () => {
      const id = await stafParcel();
      await expect(move(id, 'RECEIVED_FROM_MERCHANT')).rejects.toMatchObject({
        status: 400,
      });
      await expect(
        move(id, 'RECEIVED_FROM_MERCHANT', archivedWarehouseId),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        move(id, 'RECEIVED_FROM_MERCHANT', foreignWarehouseId),
      ).rejects.toMatchObject({ status: 404 });
      await move(id, 'RECEIVED_FROM_MERCHANT', warehouseId);
      expect(await prisma.Shipment.where({ id }).first()).toMatchObject({
        status: 'RECEIVED_FROM_MERCHANT',
        warehouseId,
        locationLabel: 'Phase A North Hub',
        locationSource: 'WAREHOUSE',
      });
      const second = await prisma.Warehouse.create({
        companyId: actor.orgId,
        name: 'Phase A South Hub',
        address: 'Fixture road 4',
      });
      await move(id, 'AT_WAREHOUSE', second.id);
      expect((await ops.details(actor, id)).parcel).toMatchObject({
        status: 'AT_WAREHOUSE',
        locationLabel: 'Phase A South Hub',
      });
    });
  });

  describe('dashboard counts', () => {
    it('buckets add up to the total, including received and cancelled parcels', async () => {
      await stafParcel();
      const received = await stafParcel();
      await move(received, 'RECEIVED_FROM_MERCHANT', warehouseId);
      const cancelled = await stafParcel();
      await move(cancelled, 'CANCELLED');
      const delivered = await stafParcel();
      await deliver(delivered);
      const { counts } = await dashboard.dashboard(actor);
      expect(counts).toMatchObject({
        total: 4,
        new: 1,
        atWarehouse: 1,
        delivered: 1,
        cancelled: 1,
      });
      const { overdue, total, ...buckets } = counts;
      expect(overdue).toBe(0);
      expect(Object.values(buckets).reduce((a, b) => a + b, 0)).toBe(total);
    });
  });
});
