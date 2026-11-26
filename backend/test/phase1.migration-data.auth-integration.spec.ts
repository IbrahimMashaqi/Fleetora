import { readFileSync } from 'node:fs';
import pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
  requireDisposableAuthTestDatabase,
} from './auth-postgres.safety.js';

// Rows inserted by test/migration-fixtures/*.sql before the Phase 1 migrations ran.
const priorityCompany = 'd0100000-0000-4000-8000-000000000001';
const usdCompany = 'd0200000-0000-4000-8000-0000000000c1';
const emptyCompany = 'd0200000-0000-4000-8000-0000000000c2';
const jodCompany = 'd0200000-0000-4000-8000-0000000000c3';

type Op = { id: string; precheck: { sql: string }[] };
const currencyOps = JSON.parse(
  readFileSync(
    new URL(
      '../migrations/app/20261125T2005_phase1_company_currency/ops.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as Op[];

/** Runs statements in one transaction that is always rolled back. */
async function rolledBack<T>(work: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({
    connectionString: requireDisposableAuthTestDatabase(process.env).url,
  });
  await db.connect();
  try {
    await db.query('BEGIN');
    return await work(db);
  } finally {
    await db.query('ROLLBACK').catch(() => undefined);
    await db.end();
  }
}

describe('Phase 1 data migrations against disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await guard.verify(() => readAuthPostgresIdentity(prisma));
  });

  describe('OD-13 merchant activation (owner decision Q13, option A)', () => {
    it('kept every pre-existing merchant ACTIVE, marked legacy, with no recorded acceptance', async () => {
      guard.assertVerified();
      const merchant = await prisma.db.orm.public.Merchant.where({
        id: 'd0200000-0000-4000-8000-0000000000e1',
      }).first();
      expect(merchant).toMatchObject({
        activationStatus: 'ACTIVE',
        legacyActivation: true,
        agreementAcceptedAt: null,
        agreementAcceptedById: null,
        agreementTerms: null,
      });
    });

    it('rejects inconsistent activation states at the database', async () => {
      guard.assertVerified();
      for (const sql of [
        `UPDATE "merchants" SET "activationStatus" = 'PENDING' WHERE "id" = 'd0200000-0000-4000-8000-0000000000e1'`,
        `UPDATE "merchants" SET "legacyActivation" = false WHERE "id" = 'd0200000-0000-4000-8000-0000000000e1'`,
        `UPDATE "merchants" SET "activationStatus" = 'SUSPENDED' WHERE "id" = 'd0200000-0000-4000-8000-0000000000e1'`,
      ])
        await expect(rolledBack((db) => db.query(sql))).rejects.toThrow(
          /merchant_activation_state/,
        );
    });
  });

  describe('OD-02/BR-066 company currency', () => {
    it('gave each existing company the one currency its data uses, ILS when it has none', async () => {
      guard.assertVerified();
      const rows = await prisma.Company.where((c) =>
        c.id.in([usdCompany, emptyCompany, jodCompany]),
      )
        .select('id', 'currency')
        .all();
      expect(Object.fromEntries(rows.map((row) => [row.id, row.currency]))).toEqual({
        [usdCompany]: 'USD',
        [emptyCompany]: 'ILS',
        [jodCompany]: 'JOD',
      });
    });

    it('stops the migration (safety stop) when a company already mixes currencies', async () => {
      guard.assertVerified();
      const guardSql = currencyOps.find(
        (op) => op.id === 'guard.companies.single_currency',
      )?.precheck[0]?.sql;
      expect(guardSql).toBeDefined();
      const result = await rolledBack(async (db) => {
        const before = await db.query<{ result: boolean }>(guardSql!);
        // Recreate the pre-migration state for one company: drop the FK, add an ILS
        // merchant next to its USD data. Rolled back afterwards.
        await db.query(
          'ALTER TABLE "merchants" DROP CONSTRAINT "merchants_companyId_currency_fkey"',
        );
        await db.query(
          `INSERT INTO "merchants" ("id","companyId","name","contactName","phone","pickupAddress","city","currency","deliveryFeeMinor","returnFeeMinor","feePayer","updatedAt")
           VALUES ('d0200000-0000-4000-8000-0000000000e9', $1, 'Mixed', 'Contact', '+0000000209', 'Street', 'City', 'ILS', 0, 0, 'MERCHANT', now())`,
          [usdCompany],
        );
        const after = await db.query<{ result: boolean }>(guardSql!);
        return [before.rows[0]?.result, after.rows[0]?.result];
      });
      expect(result).toEqual([true, false]);
    });

    it('rejects money rows whose currency differs from the company currency, including another tenant currency', async () => {
      guard.assertVerified();
      for (const [company, currency] of [
        [usdCompany, 'ILS'],
        [jodCompany, 'USD'],
        [emptyCompany, 'JOD'],
      ])
        await expect(
          rolledBack((db) =>
            db.query(
              `INSERT INTO "merchant_plans" ("id","companyId","name","currency","updatedAt") VALUES (gen_random_uuid()::text, $1, 'Wrong currency', $2, now())`,
              [company, currency],
            ),
          ),
        ).rejects.toThrow(/merchant_plans_companyId_currency_fkey/);
      await expect(
        rolledBack((db) =>
          db.query(
            `UPDATE "shipments" SET "currency" = 'ILS' WHERE "id" = 'd0200000-0000-4000-8000-0000000000a1'`,
          ),
        ),
      ).rejects.toThrow(/shipments_companyId_currency_fkey/);
    });

    it('refuses to change a company currency while it has money rows (no implicit FX)', async () => {
      guard.assertVerified();
      await expect(
        rolledBack((db) =>
          db.query(`UPDATE "companies" SET "currency" = 'EUR' WHERE "id" = $1`, [
            usdCompany,
          ]),
        ),
      ).rejects.toThrow(/companyId_currency_fkey/);
      await expect(
        rolledBack((db) =>
          db.query(`UPDATE "companies" SET "currency" = 'GBP' WHERE "id" = $1`, [
            emptyCompany,
          ]),
        ),
      ).rejects.toThrow(/company_currency/);
    });
  });

  describe('OD-10/BR-083 priority', () => {
    it('migrated existing LOW parcels to NORMAL and kept every other priority', async () => {
      guard.assertVerified();
      const rows = await prisma.db.orm.public.Shipment.where({
        companyId: priorityCompany,
      })
        .select('id', 'priority')
        .all();
      const byId = Object.fromEntries(rows.map((row) => [row.id, row.priority]));
      expect(byId).toEqual({
        'd0100000-0000-4000-8000-0000000000a1': 'NORMAL',
        'd0100000-0000-4000-8000-0000000000a2': 'HIGH',
        'd0100000-0000-4000-8000-0000000000a3': 'URGENT',
        'd0100000-0000-4000-8000-0000000000a4': 'NORMAL',
      });
    });

    it('rejects LOW at the database for inserts and updates', async () => {
      guard.assertVerified();
      const runtime = prisma.db.runtime();
      await expect(
        runtime.query(
          prisma.db.raw.sql`UPDATE "shipments" SET "priority" = 'LOW' WHERE "id" = 'd0100000-0000-4000-8000-0000000000a2' RETURNING "id"`
            .returnsRow({ id: 'pg/text@1' })
            .build(),
        ),
      ).rejects.toThrow(/shipments_priority_check/);
      await expect(
        runtime.query(
          prisma.db.raw.sql`INSERT INTO "shipments" ("id","companyId","requestedBy","destination","priority","updatedAt") VALUES ('d0100000-0000-4000-8000-0000000000b1', 'd0100000-0000-4000-8000-000000000001', 'd0100000-0000-4000-8000-0000000000f1', 'Fictional', 'LOW', now()) RETURNING "id"`
            .returnsRow({ id: 'pg/text@1' })
            .build(),
        ),
      ).rejects.toThrow(/shipments_priority_check/);
    });
  });
});
