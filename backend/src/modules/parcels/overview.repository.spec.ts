import { PGlite } from '@electric-sql/pglite';
import postgres from '@prisma/orm-postgres/runtime';
import { renderLoweredSql } from '@prisma/orm-postgres/adapter/sql-renderer';
import { buildPostgresCodecDescriptorRegistry } from '@prisma/orm-postgres/target/codec-descriptor';
import { AsyncIterableResult } from '@prisma/orm-postgres/components/runtime';
import type { RuntimeQueryable } from '@prisma/orm-postgres/orm-client';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contract } from '../../prisma/generated/contract.d';
import contractJson from '../../prisma/generated/contract.json' with { type: 'json' };
import { PrismaService } from '../prisma/prisma.service.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { OverviewRepository } from './overview.repository.js';

// Execute the production Prisma query plans against owned, in-memory PostgreSQL.
// These minimal tables mirror only the columns read; no environment URL is used.
describe('Overview aggregation in isolated PostgreSQL', () => {
  let db: PGlite;
  let overview: OverviewRepository;
  let queryCount = 0;
  const base = postgres<Contract>({ contractJson });
  const codecs = buildPostgresCodecDescriptorRegistry([...base.context.codecDescriptors.values()]);
  const actor: TokenPayload = {
    sub: 'admin-a', email: 'admin@example.invalid',
    role: 'COMPANY_ADMIN', orgId: 'company-a',
  };
  const runtime: RuntimeQueryable = {
    query<Row>(plan: Parameters<RuntimeQueryable['execute']>[0]) {
      queryCount += 1;
      const compiled = renderLoweredSql(
        plan.ast, base.context.contract, codecs,
      );
      const params = compiled.params.map((parameter) => {
        if (parameter.kind !== 'literal') throw new Error('Unexpected prepared parameter');
        return parameter.value;
      });
      return new AsyncIterableResult<Row>((async function* () {
        const result = await db.query<Row>(compiled.sql, params);
        yield* result.rows;
      })());
    },
    async execute() { throw new Error('Overview must never write'); },
  };
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(`
      CREATE TABLE shipments (
        id text PRIMARY KEY, "companyId" text NOT NULL, status text NOT NULL,
        currency text NOT NULL DEFAULT 'ILS', "codMinor" bigint NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT '2026-10-25T08:00:00Z',
        "deliveredAt" timestamptz, "returnedAt" timestamptz
      );
      CREATE TABLE cod_collections (
        id text PRIMARY KEY, "companyId" text NOT NULL, "shipmentId" text NOT NULL,
        currency text NOT NULL, "goodsMinor" bigint NOT NULL,
        "collectedAt" timestamptz NOT NULL DEFAULT '2026-10-25T08:00:00Z'
      );
      CREATE TABLE merchant_ledger_entries (
        id text PRIMARY KEY, "companyId" text NOT NULL,
        currency text NOT NULL, "amountMinor" bigint NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT '2026-10-25T08:00:00Z'
      );
      CREATE TABLE settlement_payments (
        id text PRIMARY KEY, "companyId" text NOT NULL, currency text NOT NULL,
        "amountMinor" bigint NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT '2026-10-25T08:00:00Z'
      );
      CREATE TABLE merchant_settlements (
        id text PRIMARY KEY, "companyId" text NOT NULL, status text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT '2026-10-25T08:00:00Z'
      );
      CREATE TABLE merchant_settlement_requests (
        id text PRIMARY KEY, "companyId" text NOT NULL, status text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT '2026-10-25T08:00:00Z'
      );
      CREATE TABLE pickup_requests (
        id text PRIMARY KEY, "companyId" text NOT NULL, status text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT '2026-10-25T08:00:00Z'
      );
    `);
    const module = await Test.createTestingModule({ providers: [
      OverviewRepository,
      { provide: PrismaService, useValue: { db: { raw: base.raw, runtime: () => runtime } } },
    ] }).compile();
    overview = module.get(OverviewRepository);
  }, 30000);
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
    queryCount = 0;
    await db.exec("SET TIME ZONE 'UTC'");
    await db.exec('TRUNCATE shipments, cod_collections, merchant_ledger_entries, settlement_payments, merchant_settlements, merchant_settlement_requests, pickup_requests');
  });
  afterAll(async () => { vi.useRealTimers(); await db?.close(); });
  async function shipment(id: string, status: string, extra: {
    companyId?: string; currency?: string; cod?: string;
    createdAt?: string; deliveredAt?: string; returnedAt?: string;
  } = {}) {
    await db.query(`INSERT INTO shipments VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
      id, extra.companyId ?? actor.orgId, status, extra.currency ?? 'ILS', extra.cod ?? '0',
      extra.createdAt ?? '2026-10-25T08:00:00Z', extra.deliveredAt ?? null, extra.returnedAt ?? null,
    ]);
  }
  it('returns honest zeros and seven UTC dates for an empty company', async () => {
    const result = await overview.getOverview(actor);
    expect(result.companyId).toBe(actor.orgId);
    expect(result.generatedAt).toBe('2026-10-25T12:00:00.000Z');
    expect(result.timeZone).toBe('UTC');
    expect(result.kpis).toEqual({ totalParcels: 0, inWarehouse: 0, outForDelivery: 0,
      deliveredToday: 0, returnsCount: 0, pickupRequestsPending: 0, settlementsPending: 0 });
    expect(result.parcelsByStatus).toEqual([]);
    expect(result.financeSnapshot).toEqual({ currencies: [], settlementRequestsPending: 0 });
    expect(result.parcelActivityLast7Days).toEqual(Array.from({ length: 7 }, (_, index) => ({
      date: `2026-10-${19 + index}`, created: 0, delivered: 0, returned: 0,
    })));
  });
  it('counts current statuses without double counting return stages and partitions performance', async () => {
    const statuses = ['CREATED', 'AT_WAREHOUSE', 'OUT_FOR_DELIVERY', 'DELIVERED',
      'FAILED_DELIVERY', 'RETURN_IN_PROGRESS', 'RETURNED_TO_WAREHOUSE', 'RETURNED_TO_MERCHANT',
      'RETURNED', 'CANCELLED', 'ASSIGNED', 'ON_HOLD'];
    for (const [index, status] of statuses.entries()) await shipment(String(index), status);
    const result = await overview.getOverview(actor);
    expect(result.kpis).toMatchObject({ totalParcels: 12, inWarehouse: 1, outForDelivery: 1, returnsCount: 5 });
    expect(result.deliveryPerformance).toEqual({ delivered: 1, failedOrReturned: 5, inProgress: 5, cancelled: 1 });
    expect(result.parcelsByStatus.reduce((sum, row) => sum + row.count, 0)).toBe(12);
    expect(result.kpis.deliveredToday).toBe(0); // Legacy status alone is not dated delivery evidence.
  });
  it('buckets actual event timestamps in UTC including boundaries and excludes future activity', async () => {
    await shipment('before', 'CREATED', { createdAt: '2026-10-18T23:59:59.999Z' });
    await shipment('start', 'DELIVERED', { createdAt: '2026-10-19T00:00:00Z', deliveredAt: '2026-10-25T00:00:00Z' });
    await shipment('offset', 'DELIVERED', { createdAt: '2026-10-20T01:30:00+03:00', deliveredAt: '2026-10-25T01:00:00+03:00' });
    await shipment('returned', 'RETURNED_TO_MERCHANT', { createdAt: '2026-10-01T00:00:00Z', returnedAt: '2026-10-25T12:00:00Z' });
    await shipment('future-event', 'DELIVERED', { deliveredAt: '2026-10-25T12:00:00.001Z' });
    await shipment('future-parcel', 'CREATED', { createdAt: '2026-10-25T12:00:00.001Z' });
    const result = await overview.getOverview(actor);
    expect(result.kpis.totalParcels).toBe(5);
    expect(result.parcelActivityLast7Days[0]).toEqual({ date: '2026-10-19', created: 2, delivered: 0, returned: 0 });
    expect(result.parcelActivityLast7Days[5]).toEqual({ date: '2026-10-24', created: 0, delivered: 1, returned: 0 });
    expect(result.parcelActivityLast7Days[6]).toEqual({ date: '2026-10-25', created: 1, delivered: 1, returned: 1 });
    expect(result.kpis.deliveredToday).toBe(1);
  });
  it('keeps UTC buckets when the database session uses another time zone', async () => {
    for (const column of ['createdAt', 'deliveredAt', 'returnedAt'] as const) {
      expect(contractJson.storage.namespaces.public.entries.table.shipments.columns[column].nativeType).toBe('timestamptz');
    }
    await db.exec("SET TIME ZONE 'America/Los_Angeles'");
    await shipment('midnight', 'DELIVERED', { createdAt: '2026-10-19T00:00:00Z', deliveredAt: '2026-10-25T00:00:00Z' });
    const result = await overview.getOverview(actor);
    expect(result.parcelActivityLast7Days[0]).toEqual({ date: '2026-10-19', created: 1, delivered: 0, returned: 0 });
    expect(result.parcelActivityLast7Days[6]).toEqual({ date: '2026-10-25', created: 0, delivered: 1, returned: 0 });
    expect(result.kpis.deliveredToday).toBe(1);
  });
  it('keeps monetary precision, currencies and signed net ledger balances without double-counting collections', async () => {
    await shipment('pending-large', 'DELIVERED', { cod: '9999999999999999' });
    await shipment('pending-jod', 'OUT_FOR_DELIVERY', { currency: 'JOD', cod: '1001' });
    await shipment('collected', 'DELIVERED', { cod: '12000' });
    for (const status of ['CANCELLED', 'RETURNED', 'RETURN_IN_PROGRESS', 'RETURNED_TO_WAREHOUSE', 'RETURNED_TO_MERCHANT']) {
      await shipment(status, status, { cod: '50000' });
    }
    await db.exec(`
      INSERT INTO cod_collections VALUES ('collection','company-a','collected','ILS',12000,'2026-10-25T08:00:00Z');
      INSERT INTO merchant_ledger_entries VALUES
        ('goods','company-a','ILS',12000,'2026-10-25T08:00:00Z'),
        ('fees','company-a','ILS',-2000,'2026-10-25T08:00:00Z'),
        ('adjustment','company-a','ILS',1000,'2026-10-25T08:00:00Z'),
        ('reversal','company-a','ILS',-1000,'2026-10-25T08:00:00Z'),
        ('eur-fee','company-a','EUR',-123,'2026-10-25T08:00:00Z');
      INSERT INTO settlement_payments VALUES ('paid','company-a','ILS',7000,'2026-10-25T08:00:00Z');
    `);
    expect((await overview.getOverview(actor)).financeSnapshot.currencies).toEqual([
      { currency: 'EUR', codPending: '0.00', codCollected: '0.00', merchantDuesPending: '-1.23' },
      { currency: 'ILS', codPending: '99999999999999.99', codCollected: '120.00', merchantDuesPending: '30.00' },
      { currency: 'JOD', codPending: '1.001', codCollected: '0.000', merchantDuesPending: '0.000' },
    ]);
  });
  it('distinguishes pending pickups, unpaid settlements, and settlement requests awaiting review', async () => {
    for (const status of ['REQUESTED', 'PROPOSED', 'CONFIRMED', 'RECEIVED', 'CANCELLED']) {
      await db.query('INSERT INTO pickup_requests (id,"companyId",status) VALUES ($1,$2,$1)', [status, actor.orgId]);
    }
    for (const status of ['DRAFT', 'FINALIZED', 'PAID', 'CANCELLED']) {
      await db.query('INSERT INTO merchant_settlements (id,"companyId",status) VALUES ($1,$2,$1)', [status, actor.orgId]);
    }
    for (const status of ['REQUESTED', 'REVIEWED']) {
      await db.query('INSERT INTO merchant_settlement_requests (id,"companyId",status) VALUES ($1,$2,$1)', [status, actor.orgId]);
    }
    const result = await overview.getOverview(actor);
    expect(result.kpis).toMatchObject({ pickupRequestsPending: 3, settlementsPending: 2 });
    expect(result.financeSnapshot.settlementRequestsPending).toBe(1);
  });
  it('excludes every foreign-company aggregate and scopes collection joins to the shipment company', async () => {
    await shipment('own', 'CREATED', { cod: '1000' });
    await shipment('foreign', 'DELIVERED', { companyId: 'company-b', cod: '90000', deliveredAt: '2026-10-25T08:00:00Z' });
    await db.exec(`
      INSERT INTO cod_collections (id,"companyId","shipmentId",currency,"goodsMinor") VALUES ('foreign-c','company-b','own','USD',90000);
      INSERT INTO merchant_ledger_entries (id,"companyId",currency,"amountMinor") VALUES ('foreign-l','company-b','USD',90000);
      INSERT INTO settlement_payments (id,"companyId",currency,"amountMinor") VALUES ('foreign-p','company-b','USD',90000);
      INSERT INTO pickup_requests (id,"companyId",status) VALUES ('foreign-pickup','company-b','REQUESTED');
      INSERT INTO merchant_settlements (id,"companyId",status) VALUES ('foreign-settlement','company-b','DRAFT');
      INSERT INTO merchant_settlement_requests (id,"companyId",status) VALUES ('foreign-request','company-b','REQUESTED');
    `);
    const result = await overview.getOverview(actor);
    expect(result.kpis).toMatchObject({ totalParcels: 1, deliveredToday: 0, pickupRequestsPending: 0, settlementsPending: 0 });
    expect(result.financeSnapshot).toEqual({ settlementRequestsPending: 0, currencies: [
      { currency: 'ILS', codPending: '10.00', codCollected: '0.00', merchantDuesPending: '0.00' },
    ] });
    expect(result.parcelActivityLast7Days[6].delivered).toBe(0);
  });
  it.each(['MERCHANT', 'PLATFORM_ADMIN'] as const)('denies %s before issuing a query', async (role) => {
    await expect(overview.getOverview({ ...actor, role })).rejects.toMatchObject({ status: 403 });
    expect(queryCount).toBe(0);
  });
  it('denies absent company and identity without falling back to global aggregates', async () => {
    await expect(overview.getOverview({ ...actor, orgId: '' })).rejects.toMatchObject({ status: 403 });
    await expect(overview.getOverview({ ...actor, sub: '' })).rejects.toMatchObject({ status: 401 });
    expect(queryCount).toBe(0);
  });
  it('allows the existing accountant finance-view permission', async () => {
    expect((await overview.getOverview({ ...actor, role: 'ACCOUNTANT' })).kpis.totalParcels).toBe(0);
  });
});
