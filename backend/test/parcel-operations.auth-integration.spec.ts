import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { ParcelStore, instant } from '../src/modules/parcels/parcel-store.js';
import { ParcelLedger } from '../src/modules/parcels/parcel-ledger.js';
import { ParcelOperationsRepository } from '../src/modules/parcels/parcel-operations.repository.js';
import { ParcelFinanceRepository } from '../src/modules/parcels/parcel-finance.repository.js';
import { ParcelDashboardRepository } from '../src/modules/parcels/parcel-dashboard.repository.js';
import { PageDto } from '../src/modules/parcels/parcel.dto.js';
import type { TokenPayload } from '../src/modules/auth/token/token.payload.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';

// Opt-in only: the existing setup rejects remote/shared/non-test databases.
describe('parcel operations on disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  let prisma: PrismaService,
    store: ParcelStore,
    ops: ParcelOperationsRepository,
    finance: ParcelFinanceRepository,
    dashboard: ParcelDashboardRepository;
  let actor: TokenPayload,
    foreign: TokenPayload,
    driverId: string,
    foreignDriverId: string;
  const fixtureCompanies: string[] = [];
  const key = () => randomUUID();
  const str = (value: unknown) => {
    if (typeof value !== 'string')
      throw new Error('Expected string projection');
    return value;
  };
  async function identity() {
    const company = await prisma.Company.create({
      name: 'Isolated parcel integration fixture',
    });
    fixtureCompanies.push(company.id);
    const user = await prisma.User.create({
      companyId: company.id,
      fullName: 'Fixture operator',
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
  const merchantInput = (payer: 'MERCHANT' | 'CUSTOMER' = 'MERCHANT') => ({
    name: 'Fixture business',
    contactName: 'Fixture contact',
    phone: '+000000000',
    pickupAddress: 'Fixture pickup',
    city: 'Fixture city',
    currency: 'ILS',
    deliveryFee: '15.00',
    returnFee: '5.00',
    serviceFee: '2.00',
    feePayer: payer,
    returnFeePolicy: 'ON_MERCHANT_HANDOFF',
  });
  async function merchant(
    who = actor,
    payer: 'MERCHANT' | 'CUSTOMER' = 'MERCHANT',
  ) {
    return str((await ops.saveMerchant(who, merchantInput(payer))).merchant.id);
  }
  async function parcel(merchantId: string, who = actor, codAmount = '100.00') {
    return str(
      (
        await ops.saveParcel(who, {
          merchantId,
          recipientName: 'Fixture recipient',
          recipientPhone: '+000000000',
          city: 'Fixture city',
          destination: 'Fixture destination',
          description: 'Fixture goods',
          pieces: 1,
          codAmount,
          customerNotes: 'Call at the entrance',
        })
      ).parcel.id,
    );
  }
  async function draftInput(merchantId: string, currency = 'ILS') {
    const response = await finance.preview(actor, { merchantId, currency });
    return {
      merchantId,
      currency,
      expectedPreviewHash: str(response.preview.previewHash),
      idempotencyKey: key(),
    };
  }
  async function revision(id: string, who = actor) {
    return Number((await ops.details(who, id)).parcel.revision);
  }
  async function transition(id: string, status: string, who = actor) {
    return ops.transition(who, id, {
      revision: await revision(id, who),
      status,
    });
  }
  async function dispatched(merchantId: string, codAmount = '100.00') {
    const id = await parcel(merchantId, actor, codAmount);
    await transition(id, 'RECEIVED_FROM_MERCHANT');
    await transition(id, 'AT_WAREHOUSE');
    await ops.assignment(actor, id, {
      revision: await revision(id),
      workerId: driverId,
    });
    await transition(id, 'OUT_FOR_DELIVERY');
    return id;
  }
  async function delivered(merchantId: string) {
    const id = await dispatched(merchantId);
    await ops.attempt(actor, id, {
      revision: await revision(id),
      outcome: 'DELIVERED',
    });
    return id;
  }
  async function collected(
    merchantId: string,
    payer: 'MERCHANT' | 'CUSTOMER' = 'MERCHANT',
  ) {
    const id = await delivered(merchantId);
    const response = await finance.collect(actor, {
      parcelId: id,
      amount: payer === 'MERCHANT' ? '100.00' : '117.00',
      method: 'CASH',
      notes: 'Fixture collection notes',
      idempotencyKey: key(),
    });
    return { id, collectionId: str(response.collection.id) };
  }
  async function remitted(merchantId: string) {
    const response = await collected(merchantId);
    await finance.remit(actor, response.collectionId, {
      amount: '100.00',
      method: 'CASH',
      idempotencyKey: key(),
    });
    return response;
  }
  beforeAll(async () => {
    prisma = new PrismaService();
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    store = new ParcelStore(prisma);
    const ledger = new ParcelLedger(store);
    ops = new ParcelOperationsRepository(store, ledger);
    finance = new ParcelFinanceRepository(store, ledger);
    dashboard = new ParcelDashboardRepository(store);
  });
  beforeEach(async () => {
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    actor = await identity();
    foreign = await identity();
    driverId = (
      await prisma.Worker.create({
        companyId: actor.orgId,
        fullName: 'Fixture driver',
        phone: '+000000000',
      })
    ).id;
    foreignDriverId = (
      await prisma.Worker.create({
        companyId: foreign.orgId,
        fullName: 'Foreign fixture driver',
        phone: '+000000001',
      })
    ).id;
  });
  afterAll(async () => {
    await guard.teardown(
      async () => {
        await guard.verify(() => readAuthPostgresIdentity(prisma));
        for (const companyId of fixtureCompanies) {
          await prisma.db.orm.public.SettlementPayment.where({
            companyId,
          }).deleteAll();
          await prisma.db.orm.public.SettlementAllocation.where({
            companyId,
          }).deleteAll();
          await prisma.db.orm.public.MerchantSettlementLine.where({
            companyId,
          }).deleteAll();
          await prisma.db.orm.public.MerchantSettlement.where({
            companyId,
          }).deleteAll();
          await prisma.db.orm.public.MerchantLedgerEntry.where({
            companyId,
            kind: 'REVERSAL',
          }).deleteAll();
          await prisma.db.orm.public.MerchantLedgerEntry.where({
            companyId,
          }).deleteAll();
          await prisma.db.orm.public.CashRemittance.where({
            companyId,
          }).deleteAll();
          await prisma.db.orm.public.CodCollection.where({
            companyId,
          }).deleteAll();
          await prisma.db.orm.public.ParcelAttempt.where({
            companyId,
          }).deleteAll();
          await prisma.db.orm.public.ParcelReturn.where({
            companyId,
          }).deleteAll();
          await prisma.ShipmentHistory.where((h) =>
            h.shipment.some((s) => s.companyId.eq(companyId)),
          ).deleteAll();
          await prisma.Shipment.where({ companyId }).deleteAll();
          await prisma.db.orm.public.Merchant.where({ companyId }).deleteAll();
          await prisma.db.orm.public.MonetaryRequest.where({
            companyId,
          }).deleteAll();
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
  it('completes the full delivery, separate cash remittance, admin approval and actual payout with an auditable timeline', async () => {
    const merchantId = await merchant();
    const { id, collectionId } = await collected(merchantId);
    expect(
      (await finance.preview(actor, { merchantId, currency: 'ILS' })).preview
        .netPayable,
    ).toBe('-17.00');
    await expect(
      finance.draft(actor, await draftInput(merchantId)),
    ).rejects.toMatchObject({ status: 400 });
    await finance.remit(actor, collectionId, {
      amount: '100.00',
      method: 'CASH',
      reference: 'Company receipt',
      notes: 'Fixture remittance notes',
      idempotencyKey: key(),
    });
    expect(
      (await finance.preview(actor, { merchantId, currency: 'ILS' })).preview,
    ).toMatchObject({
      grossCollected: '100.00',
      deliveryFees: '17.00',
      netPayable: '83.00',
    });
    const draft = await finance.draft(actor, await draftInput(merchantId));
    const settlementId = str(draft.settlement.id);
    expect(draft.settlement.status).toBe('DRAFT');
    const finalized = await finance.finalize(actor, settlementId, {
      revision: 1,
      idempotencyKey: key(),
    });
    expect(finalized.settlement.status).toBe('FINALIZED');
    const paid = await finance.pay(actor, settlementId, {
      revision: 2,
      amount: '83.00',
      method: 'BANK_TRANSFER',
      reference: 'Actual fixture bank payment',
      paidAt: new Date().toISOString(),
      idempotencyKey: key(),
    });
    expect(paid.settlement).toMatchObject({
      status: 'PAID',
      netPayable: '83.00',
    });
    expect((await ops.merchant(actor, merchantId)).balances).toEqual([
      { currency: 'ILS', balance: '0.00', eligible: '0.00', paid: '83.00' },
    ]);
    const detail = await ops.details(actor, id);
    expect(detail.parcel.customerNotes).toBe('Call at the entrance');
    expect(detail.collection).toMatchObject({
      notes: 'Fixture collection notes',
      remittanceNotes: 'Fixture remittance notes',
    });
    expect(detail.parcel).toMatchObject({
      status: 'DELIVERED',
      attemptCount: 1,
      custody: 'CUSTOMER',
    });
    expect(detail.events.map((e) => e.event)).toContain('CASH_REMITTED');
    expect(paid.settlement.lines).toHaveLength(2);
    expect(paid.settlement.payments).toHaveLength(1);
  });
  it('credits only goods when customer pays company delivery and service charges', async () => {
    const merchantId = await merchant(actor, 'CUSTOMER');
    const { id, collectionId } = await collected(merchantId, 'CUSTOMER');
    expect((await ops.details(actor, id)).parcel.expectedCustomerTotal).toBe(
      '117.00',
    );
    await finance.remit(actor, collectionId, {
      amount: '117.00',
      method: 'CASH',
      idempotencyKey: key(),
    });
    expect(
      (await finance.preview(actor, { merchantId, currency: 'ILS' })).preview,
    ).toMatchObject({
      grossCollected: '100.00',
      deliveryFees: '0.00',
      netPayable: '100.00',
    });
  });
  it('delivers a zero-COD parcel without inventing a collection, remittance or goods credit', async () => {
    const merchantId = await merchant();
    const id = await dispatched(merchantId, '0.00');
    await ops.attempt(actor, id, {
      revision: await revision(id),
      outcome: 'DELIVERED',
    });
    const detail = await ops.details(actor, id);
    expect(detail.parcel).toMatchObject({
      status: 'DELIVERED',
      codAmount: '0.00',
      expectedCustomerTotal: '0.00',
      collectionRequired: false,
    });
    expect(detail.collection).toBeNull();
    const requestKey = key();
    await expect(finance.collect(actor, {
      parcelId: id, amount: '0.00', method: 'CASH', idempotencyKey: requestKey,
    })).rejects.toMatchObject({ status: 400 });
    expect(await store.orm.MonetaryRequest.where({ companyId: actor.orgId, key: requestKey }).first()).toBeNull();
    expect((await finance.collections(actor, new PageDto())).items).toEqual([]);
    expect((await finance.statement(actor, merchantId, new PageDto())).items).toMatchObject([
      { kind: 'DELIVERY_FEE', amount: '-17.00' },
    ]);
    expect((await dashboard.dashboard(actor, { merchantId })).money).toMatchObject([
      { expectedCod: '0.00', uncollectedCod: '0.00', collectedCod: '0.00', unremittedCash: '0.00' },
    ]);
    expect((await ops.parcels(actor, new PageDto())).items).toMatchObject([
      { id, collectionRequired: false },
    ]);
    await expect(ops.details(foreign, id)).rejects.toMatchObject({ status: 404 });
  });
  it('requires collection of customer-paid charges even when the goods COD is zero', async () => {
    const merchantId = await merchant(actor, 'CUSTOMER');
    const id = await dispatched(merchantId, '0.00');
    await ops.attempt(actor, id, {
      revision: await revision(id), outcome: 'DELIVERED',
    });
    expect((await ops.details(actor, id)).parcel).toMatchObject({
      codAmount: '0.00', expectedCustomerTotal: '17.00', collectionRequired: true,
    });
    const response = await finance.collect(actor, {
      parcelId: id, amount: '17.00', method: 'CASH', idempotencyKey: key(),
    });
    expect(response.collection).toMatchObject({ amount: '17.00', goodsAmount: '0.00' });
    expect((await finance.statement(actor, merchantId, new PageDto())).items).toEqual([]);
  });
  it('rolls back delivery, custody, attempt and audit changes when the required fee posting fails', async () => {
    const merchantId = await merchant();
    const id = await dispatched(merchantId);
    // An owned fixture forces a real PostgreSQL posting-key collision after the
    // operational updates. No transaction or persistence layer is mocked.
    const blocker = await store.orm.MerchantLedgerEntry.create({
      companyId: actor.orgId, merchantId, shipmentId: id, currency: 'ILS',
      kind: 'DELIVERY_FEE', amountMinor: -1700n, reason: 'Isolated collision fixture',
      actorId: actor.sub, postingKey: `DELIVERY_FEE:${id}`,
    });
    const before = await ops.details(actor, id);
    const balances = (await ops.merchant(actor, merchantId)).balances;
    await expect(ops.attempt(actor, id, {
      revision: Number(before.parcel.revision), outcome: 'DELIVERED',
    })).rejects.toMatchObject({ status: 409 });
    const after = await ops.details(actor, id);
    expect(after.parcel).toEqual(before.parcel);
    expect(after.attempts).toEqual(before.attempts);
    expect(after.events).toEqual(before.events);
    expect((await ops.merchant(actor, merchantId)).balances).toEqual(balances);
    await store.orm.MerchantLedgerEntry.where({ companyId: actor.orgId, id: blocker.id }).delete();
    await ops.attempt(actor, id, {
      revision: Number(before.parcel.revision), outcome: 'DELIVERED',
    });
    expect((await ops.details(actor, id)).parcel.status).toBe('DELIVERED');
    expect((await finance.statement(actor, merchantId, new PageDto())).items).toHaveLength(1);
  });
  it('rolls back a collection and leaves its retry key usable when goods posting fails', async () => {
    const merchantId = await merchant();
    const id = await delivered(merchantId);
    const blocker = await store.orm.MerchantLedgerEntry.create({
      companyId: actor.orgId, merchantId, shipmentId: id, currency: 'ILS',
      kind: 'ADJUSTMENT', amountMinor: 1n, reason: 'Isolated collision fixture',
      actorId: actor.sub, postingKey: `GOODS:${id}`,
    });
    const input = { parcelId: id, amount: '100.00', method: 'CASH', idempotencyKey: key() };
    const before = await ops.details(actor, id);
    const balances = (await ops.merchant(actor, merchantId)).balances;
    await expect(finance.collect(actor, input)).rejects.toMatchObject({ status: 409 });
    expect(await ops.details(actor, id)).toEqual(before);
    expect((await ops.merchant(actor, merchantId)).balances).toEqual(balances);
    expect(await store.orm.CodCollection.where({ companyId: actor.orgId, shipmentId: id }).first()).toBeNull();
    expect(await store.orm.MonetaryRequest.where({ companyId: actor.orgId, key: input.idempotencyKey }).first()).toBeNull();
    await store.orm.MerchantLedgerEntry.where({ companyId: actor.orgId, id: blocker.id }).delete();
    const result = await finance.collect(actor, input);
    expect(await finance.collect(actor, input)).toEqual(result);
    expect((await finance.collections(actor, new PageDto())).items).toHaveLength(1);
    expect((await finance.statement(actor, merchantId, new PageDto())).items).toHaveLength(2);
  });
  it('records structured failure, return custody, and exactly one merchant handoff fee without collection credit', async () => {
    const merchantId = await merchant();
    const id = await dispatched(merchantId);
    await ops.attempt(actor, id, {
      revision: await revision(id),
      outcome: 'FAILED',
      reason: 'Recipient refused',
    });
    await ops.startReturn(actor, {
      parcelId: id,
      revision: await revision(id),
      reason: 'CUSTOMER_REFUSED',
    });
    const returned = await ops.returns(actor, new PageDto());
    const returnId = returned.items[0].id;
    await ops.returnTransition(actor, returnId, {
      revision: await revision(id),
      status: 'RETURNED_TO_WAREHOUSE',
    });
    await ops.returnTransition(actor, returnId, {
      revision: await revision(id),
      status: 'RETURNED_TO_MERCHANT',
    });
    await expect(transition(id, 'DELIVERED')).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      ops.returnTransition(actor, returnId, {
        revision: await revision(id),
        status: 'RETURNED_TO_MERCHANT',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await finance.statement(actor, merchantId, new PageDto())).items,
    ).toMatchObject([{ kind: 'RETURN_FEE', amount: '-5.00' }]);
    expect((await ops.details(actor, id)).parcel).toMatchObject({
      custody: 'MERCHANT',
      status: 'RETURNED_TO_MERCHANT',
      attemptCount: 1,
    });
  });
  it('preserves fee snapshots when merchant terms change and supports a no-return-fee agreement', async () => {
    const merchantId = await merchant();
    const id = await parcel(merchantId);
    await ops.saveMerchant(
      actor,
      {
        ...merchantInput(),
        deliveryFee: '99.00',
        returnFeePolicy: 'NONE',
        revision: 1,
      },
      merchantId,
    );
    expect((await ops.details(actor, id)).parcel.deliveryFee).toBe('15.00');
    const returned = await dispatched(merchantId);
    await ops.startReturn(actor, {
      parcelId: returned,
      revision: await revision(returned),
      reason: 'MERCHANT_REQUESTED',
    });
    const returnRecord = (await ops.details(actor, returned)).returnRecord;
    if (!returnRecord) throw new Error('Missing return');
    await ops.returnTransition(actor, returnRecord.id, {
      revision: await revision(returned),
      status: 'RETURNED_TO_WAREHOUSE',
    });
    await ops.returnTransition(actor, returnRecord.id, {
      revision: await revision(returned),
      status: 'RETURNED_TO_MERCHANT',
    });
    expect(
      (await finance.statement(actor, merchantId, new PageDto())).items,
    ).toEqual([]);
  });
  it('rejects cross-company merchants, parcels, drivers, returns, settlements and scopes aggregates', async () => {
    const merchantId = await merchant(foreign);
    const foreignParcel = await parcel(merchantId, foreign);
    await expect(ops.merchant(actor, merchantId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(ops.details(actor, foreignParcel)).rejects.toMatchObject({
      status: 404,
    });
    await expect(parcel(merchantId)).rejects.toMatchObject({ status: 404 });
    const ownMerchant = await merchant();
    const own = await parcel(ownMerchant);
    await transition(own, 'RECEIVED_FROM_MERCHANT');
    await transition(own, 'AT_WAREHOUSE');
    await expect(
      ops.assignment(actor, own, {
        revision: await revision(own),
        workerId: foreignDriverId,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      ops.returnTransition(actor, randomUUID(), {
        revision: 1,
        status: 'RETURNED_TO_WAREHOUSE',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(finance.settlement(actor, randomUUID())).rejects.toMatchObject(
      { status: 404 },
    );
    expect(
      (await ops.parcels(actor, new PageDto())).items.map((p) => p.id),
    ).toEqual([own]);
    expect((await dashboard.dashboard(actor)).counts.total).toBe(1);
  });
  it('enforces accountant permissions and persisted user role changes', async () => {
    const merchantId = await merchant();
    const id = await parcel(merchantId);
    const accountant = await prisma.User.create({
      companyId: actor.orgId,
      fullName: 'Fixture accountant',
      password: randomUUID(),
      email: `${randomUUID()}@example.invalid`,
      role: 'ACCOUNTANT',
      isActive: true,
      isEmailVerified: true,
    });
    const staff = { ...actor, sub: accountant.id, role: 'ACCOUNTANT' as const };
    expect((await ops.parcels(staff, new PageDto())).items).toHaveLength(1);
    expect((await ops.drivers(staff, new PageDto())).items).toHaveLength(1);
    await expect(
      ops.saveMerchant(staff, merchantInput()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      ops.transition(staff, id, {
        revision: 1,
        status: 'RECEIVED_FROM_MERCHANT',
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      finance.finalize(staff, randomUUID(), {
        revision: 1,
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ status: 403 });
    await prisma.User.where({ id: actor.sub }).update({ role: 'MERCHANT' });
    await expect(
      ops.saveMerchant(actor, merchantInput()),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('retries monetary actions exactly once and rejects payload changes and duplicate collection keys', async () => {
    const merchantId = await merchant();
    const id = await delivered(merchantId);
    const request = {
      parcelId: id,
      amount: '100.00',
      method: 'CASH',
      idempotencyKey: key(),
    };
    const results = await Promise.all([
      finance.collect(actor, request),
      finance.collect(actor, request),
    ]);
    expect(results[0].collection.id).toBe(results[1].collection.id);
    await expect(
      finance.collect(actor, { ...request, amount: '99.00' }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      finance.collect(actor, { ...request, idempotencyKey: key() }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await prisma.db.orm.public.CodCollection.where({
        companyId: actor.orgId,
      }).all(),
    ).toHaveLength(1);
  });
  it('rejects partial collection, remittance and payment; calculation alone never marks paid', async () => {
    const merchantId = await merchant();
    const id = await delivered(merchantId);
    await expect(
      finance.collect(actor, {
        parcelId: id,
        amount: '99.00',
        method: 'CASH',
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ status: 400 });
    const collection = await finance.collect(actor, {
      parcelId: id,
      amount: '100.00',
      method: 'CASH',
      idempotencyKey: key(),
    });
    const collectionId = str(collection.collection.id);
    await expect(
      finance.remit(actor, collectionId, {
        amount: '50.00',
        method: 'CASH',
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ status: 400 });
    await finance.remit(actor, collectionId, {
      amount: '100.00',
      method: 'CASH',
      idempotencyKey: key(),
    });
    const draft = await finance.draft(actor, await draftInput(merchantId));
    const settlementId = str(draft.settlement.id);
    await finance.finalize(actor, settlementId, {
      revision: 1,
      idempotencyKey: key(),
    });
    await expect(
      finance.pay(actor, settlementId, {
        revision: 2,
        amount: '40.00',
        method: 'CASH',
        reference: 'Partial rejected',
        paidAt: new Date().toISOString(),
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await finance.settlement(actor, settlementId)).settlement.status,
    ).toBe('FINALIZED');
  });
  it('serializes competing drafts and stale parcel transitions', async () => {
    const merchantId = await merchant();
    await remitted(merchantId);
    const drafts = await Promise.allSettled([
      finance.draft(actor, await draftInput(merchantId)),
      finance.draft(actor, await draftInput(merchantId)),
    ]);
    expect(drafts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const allocations = await prisma.db.orm.public.SettlementAllocation.where({
      companyId: actor.orgId,
    }).all();
    expect(new Set(allocations.map((a) => a.ledgerEntryId)).size).toBe(
      allocations.length,
    );
    const id = await parcel(merchantId);
    const transitions = await Promise.allSettled([
      ops.transition(actor, id, {
        revision: 1,
        status: 'RECEIVED_FROM_MERCHANT',
      }),
      ops.transition(actor, id, { revision: 1, status: 'CANCELLED' }),
    ]);
    expect(transitions.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('retains cancelled draft audit lines, releases reservations, and prevents finalized cancellation', async () => {
    const merchantId = await merchant();
    await remitted(merchantId);
    const first = await finance.draft(actor, await draftInput(merchantId));
    const id = str(first.settlement.id);
    const cancelled = await finance.cancel(actor, id, {
      revision: 1,
      reason: 'Fixture cancellation',
      idempotencyKey: key(),
    });
    expect(cancelled.settlement.lines).toEqual(first.settlement.lines);
    expect(cancelled.settlement.status).toBe('CANCELLED');
    expect(
      await prisma.db.orm.public.SettlementAllocation.where({
        companyId: actor.orgId,
        settlementId: id,
      }).all(),
    ).toEqual([]);
    expect(
      await prisma.db.orm.public.MerchantSettlementLine.where({
        companyId: actor.orgId,
        settlementId: id,
      }).all(),
    ).toHaveLength(first.settlement.lines.length);
    const second = await finance.draft(actor, await draftInput(merchantId));
    const secondId = str(second.settlement.id);
    const request = { revision: 1, idempotencyKey: key() };
    const finalized = await Promise.all([
      finance.finalize(actor, secondId, request),
      finance.finalize(actor, secondId, request),
    ]);
    expect(finalized[0].settlement.status).toBe('FINALIZED');
    await expect(
      finance.cancel(actor, secondId, {
        revision: 2,
        reason: 'Invalid cancellation',
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('reverses only an eligible manual adjustment and keeps signed original history', async () => {
    const merchantId = await merchant();
    const entry = await finance.adjustment(actor, {
      merchantId,
      currency: 'ILS',
      amount: '20.00',
      reason: 'Approved fixture credit',
      idempotencyKey: key(),
    });
    const id = str(entry.entry.id);
    const reversal = await finance.reversal(actor, id, {
      reason: 'Correct fixture credit',
      idempotencyKey: key(),
    });
    expect(reversal.entry).toMatchObject({
      originalId: id,
      kind: 'REVERSAL',
      amount: '-20.00',
    });
    await expect(
      finance.reversal(actor, id, {
        reason: 'Duplicate reversal',
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    const allocated = await finance.adjustment(actor, {
      merchantId,
      currency: 'ILS',
      amount: '10.00',
      reason: 'Approved second credit',
      idempotencyKey: key(),
    });
    await finance.draft(actor, await draftInput(merchantId));
    await expect(
      finance.reversal(actor, str(allocated.entry.id), {
        reason: 'Allocated adjustment',
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('refuses stale preview confirmation and includes older debts before allowing payout', async () => {
    const merchantId = await merchant();
    await finance.adjustment(actor, {
      merchantId,
      currency: 'ILS',
      amount: '20.00',
      reason: 'Approved current credit',
      idempotencyKey: key(),
    });
    const request = await draftInput(merchantId);
    await finance.adjustment(actor, {
      merchantId,
      currency: 'ILS',
      amount: '-1.00',
      reason: 'Approved later debit',
      idempotencyKey: key(),
    });
    await expect(finance.draft(actor, request)).rejects.toMatchObject({
      status: 409,
    });
    await prisma.db.orm.public.MerchantLedgerEntry.create({
      companyId: actor.orgId,
      merchantId,
      currency: 'ILS',
      kind: 'ADJUSTMENT',
      amountMinor: -500n,
      reason: 'Older approved debt fixture',
      actorId: actor.sub,
      postingKey: key(),
      createdAt: instant('2025-01-01'),
    });
    const input = {
      merchantId,
      currency: 'ILS',
      from: new Date().toISOString().slice(0, 10),
    };
    const preview = await finance.preview(actor, input);
    await expect(
      finance.draft(actor, {
        ...input,
        expectedPreviewHash: str(preview.preview.previewHash),
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('settles JOD three-digit amounts exactly and keeps currencies independent', async () => {
    const merchantId = str(
      (
        await ops.saveMerchant(actor, {
          ...merchantInput(),
          currency: 'JOD',
          deliveryFee: '1.111',
          returnFee: '0.222',
          serviceFee: '0.000',
        })
      ).merchant.id,
    );
    const id = await delivered(merchantId);
    const response = await finance.collect(actor, {
      parcelId: id,
      amount: '100.000',
      method: 'CASH',
      idempotencyKey: key(),
    });
    await finance.remit(actor, str(response.collection.id), {
      amount: '100.000',
      method: 'CASH',
      idempotencyKey: key(),
    });
    expect(
      (await finance.preview(actor, { merchantId, currency: 'JOD' })).preview
        .netPayable,
    ).toBe('98.889');
    expect(
      (await finance.preview(actor, { merchantId, currency: 'USD' })).preview
        .netPayable,
    ).toBe('0.00');
    const draft = await finance.draft(
      actor,
      await draftInput(merchantId, 'JOD'),
    );
    expect(draft.settlement.netPayable).toBe('98.889');
  });
  it('prevents concurrent delivery from duplicating fee postings', async () => {
    const merchantId = await merchant(),
      id = await dispatched(merchantId),
      expected = await revision(id);
    const results = await Promise.allSettled([
      ops.transition(actor, id, { revision: expected, status: 'DELIVERED' }),
      ops.transition(actor, id, { revision: expected, status: 'DELIVERED' }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect((await ops.details(actor, id)).parcel.attemptCount).toBe(1);
    expect(
      await prisma.db.orm.public.ParcelAttempt.where({
        companyId: actor.orgId,
        shipmentId: id,
      }).all(),
    ).toHaveLength(1);
    expect(
      await prisma.db.orm.public.MerchantLedgerEntry.where({
        companyId: actor.orgId,
        shipmentId: id,
        kind: 'DELIVERY_FEE',
      }).all(),
    ).toHaveLength(1);
  });
  it('enforces database tenant FKs and signed posting constraints beyond application checks', async () => {
    const merchantId = await merchant(),
      id = await parcel(merchantId);
    await expect(
      prisma.Shipment.where({ companyId: actor.orgId, id }).update({
        workerId: foreignDriverId,
      }),
    ).rejects.toBeDefined();
    const warehouse = await prisma.Warehouse.create({
      companyId: foreign.orgId,
      name: 'Foreign fixture warehouse',
      address: 'Fixture address',
    });
    await expect(
      prisma.Shipment.where({ companyId: actor.orgId, id }).update({
        warehouseId: warehouse.id,
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.db.orm.public.MerchantLedgerEntry.create({
        companyId: actor.orgId,
        merchantId,
        currency: 'ILS',
        kind: 'DELIVERY_FEE',
        amountMinor: 100n,
        shipmentId: id,
        reason: 'Invalid positive fee fixture',
        actorId: actor.sub,
        postingKey: key(),
      }),
    ).rejects.toBeDefined();
    await prisma.Warehouse.where({
      id: warehouse.id,
      companyId: foreign.orgId,
    }).delete();
  });
  it('filters dashboard counts and money by the same merchant and shows actual uncollected delivered COD', async () => {
    const first = await merchant(),
      second = await merchant();
    await delivered(first);
    await parcel(second);
    const response = await dashboard.dashboard(actor, { merchantId: first });
    expect(response.counts.total).toBe(1);
    expect(response.counts.delivered).toBe(1);
    expect(response.money).toMatchObject([
      {
        currency: 'ILS',
        expectedCod: '100.00',
        uncollectedCod: '100.00',
        collectedCod: '0.00',
        merchantPayables: '-17.00',
      },
    ]);
    const excluded = await dashboard.dashboard(actor, {
      merchantId: first,
      city: 'No fixture matches',
    });
    expect(excluded.counts.total).toBe(0);
    expect(excluded.money).toEqual([]);
    expect(excluded.recentActivity).toEqual([]);
  });
  it('requires explicit driver handback before reassignment and records old/new driver identity snapshots', async () => {
    const merchantId = await merchant(),
      id = await dispatched(merchantId);
    await ops.transition(actor, id, {
      revision: await revision(id),
      status: 'FAILED_DELIVERY',
      note: 'Recipient unreachable',
    });
    const second = await prisma.Worker.create({
      companyId: actor.orgId,
      fullName: 'Second fixture driver',
      phone: '+000000002',
    });
    await expect(
      ops.assignment(actor, id, {
        revision: await revision(id),
        workerId: second.id,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await ops.details(actor, id)).parcel).toMatchObject({
      workerId: driverId,
      custody: 'DRIVER',
      attemptCount: 1,
    });
    await ops.assignment(actor, id, {
      revision: await revision(id),
      workerId: driverId,
    });
    await ops.location(actor, id, {
      revision: await revision(id),
      custody: 'WAREHOUSE',
      locationSource: 'MANUAL_HANDOFF',
      locationLabel: 'Verified warehouse handback',
    });
    await ops.assignment(actor, id, {
      revision: await revision(id),
      workerId: second.id,
    });
    const event = (await ops.details(actor, id)).events.find(
      (event) =>
        event.event === 'DRIVER_ASSIGNED' && event.newWorkerId === second.id,
    );
    expect(event).toMatchObject({
      oldWorkerId: driverId,
      oldWorkerName: 'Fixture driver',
      newWorkerId: second.id,
      newWorkerName: 'Second fixture driver',
      actorId: actor.sub,
    });
    expect((await ops.details(actor, id)).parcel.custody).toBe('WAREHOUSE');
  });
  it('refreshes merchant pickup location on a safe new parcel edit and rejects merchant replacement after handoff', async () => {
    const first = await merchant();
    const second = str(
      (
        await ops.saveMerchant(actor, {
          ...merchantInput(),
          name: 'Searchable storefront',
          pickupAddress: 'Second merchant pickup',
        })
      ).merchant.id,
    );
    const id = await parcel(first);
    const edit = {
      merchantId: second,
      recipientName: 'Fixture recipient',
      recipientPhone: '+000000000',
      city: 'Fixture city',
      destination: 'Fixture destination',
      description: 'Fixture goods',
      pieces: 1,
      codAmount: '100.00',
    };
    await ops.saveParcel(actor, { ...edit, revision: await revision(id) }, id);
    expect((await ops.details(actor, id)).parcel).toMatchObject({
      merchantId: second,
      custody: 'MERCHANT',
      locationLabel: 'Second merchant pickup',
      locationSource: 'MERCHANT_ADDRESS',
    });
    expect(
      (
        await ops.parcels(
          actor,
          Object.assign(new PageDto(), { search: 'Searchable storefront' }),
        )
      ).items.map((row) => row.id),
    ).toEqual([id]);
    expect(
      (await dashboard.dashboard(actor, { search: 'Searchable storefront' }))
        .counts.total,
    ).toBe(1);
    await ops.location(actor, id, {
      revision: await revision(id),
      custody: 'COMPANY',
      locationSource: 'MANUAL_HANDOFF',
      locationLabel: 'Company intake desk',
    });
    await expect(
      ops.saveParcel(
        actor,
        { ...edit, merchantId: first, revision: await revision(id) },
        id,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await ops.details(actor, id)).parcel).toMatchObject({
      merchantId: second,
      locationLabel: 'Company intake desk',
    });
  });
  it('counts only CASH as unremitted driver cash while every method still needs separate remittance confirmation', async () => {
    const merchantId = await merchant();
    for (const method of ['CASH', 'CARD', 'BANK_TRANSFER']) {
      const id = await delivered(merchantId);
      await finance.collect(actor, {
        parcelId: id,
        amount: '100.00',
        method,
        idempotencyKey: key(),
      });
    }
    const result = await dashboard.dashboard(actor, { merchantId });
    expect(result.money).toMatchObject([
      { currency: 'ILS', collectedCod: '300.00', unremittedCash: '100.00' },
    ]);
    expect(
      (
        await finance.collections(
          actor,
          Object.assign(new PageDto(), { merchantId, remitted: false }),
        )
      ).items,
    ).toHaveLength(3);
    expect(
      (await finance.preview(actor, { merchantId, currency: 'ILS' })).preview
        .netPayable,
    ).toBe('-51.00');
  });
});
