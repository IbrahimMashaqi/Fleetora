#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/c8a9d6da8ad8dccf886dbbbdc8ef3564762b631b3fcc5c988586be2b5daa9a2c/contract';
import endContract from '../../snapshots/c8a9d6da8ad8dccf886dbbbdc8ef3564762b631b3fcc5c988586be2b5daa9a2c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f0ba33380248edd4599dfcbb3e7f84bff45cf5c9b67ffe362e8b073a1ef7aa0e/contract';
import startContract from '../../snapshots/f0ba33380248edd4599dfcbb3e7f84bff45cf5c9b67ffe362e8b073a1ef7aa0e/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, rawSql } from '@prisma/orm-postgres/migration';

// OD-02 / BR-066 / FR-PL-06: every money table must carry its company's single currency.
const MONEY_TABLES = [
  'merchants',
  'merchant_plans',
  'delivery_zones',
  'shipments',
  'cod_collections',
  'merchant_ledger_entries',
  'merchant_settlements',
  'settlement_payments',
  'merchant_settlement_requests',
];
const CURRENCIES = MONEY_TABLES.map(
  (table) => `SELECT "companyId", "currency" FROM "public"."${table}"`,
).join(' UNION ');

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      // Safety stop (owner-approved): a company whose existing rows use more than one
      // currency cannot be assigned one automatically. Nothing is rewritten here; an
      // operator must resolve it deliberately first. Find such companies with:
      //   SELECT "companyId" FROM (<union of the money tables>) u
      //   GROUP BY "companyId" HAVING count(DISTINCT "currency") > 1;
      rawSql({
        id: 'guard.companies.single_currency',
        label: 'Require at most one currency per company in existing data',
        operationClass: 'additive',
        target: {
          id: 'postgres',
          details: { schema: 'public', objectType: 'table', name: 'companies' },
        },
        precheck: [
          {
            description:
              'ensure no company already holds money rows in more than one currency (resolve manually before migrating)',
            sql: `SELECT NOT EXISTS (SELECT 1 FROM (${CURRENCIES}) u GROUP BY "companyId" HAVING count(DISTINCT "currency") > 1) AS "result"`,
            params: [],
          },
        ],
        execute: [],
        postcheck: [],
      }),
      this.addColumn({
        schema: 'public',
        table: 'companies',
        column: col('currency', 'text', {
          notNull: true,
          default: lit('ILS'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      // Existing companies take the one currency their data already uses; a company
      // with no money rows keeps the default ILS.
      rawSql({
        id: 'data.companies.currency_backfill',
        label: 'Set each company currency from its existing money rows',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: { schema: 'public', objectType: 'table', name: 'companies' },
        },
        precheck: [],
        execute: [
          {
            description: 'copy the single existing data currency onto each company',
            sql: `UPDATE "public"."companies" c SET "currency" = u."currency" FROM (SELECT "companyId", min("currency") AS "currency" FROM (${CURRENCIES}) a GROUP BY "companyId") u WHERE u."companyId" = c."id"`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'ensure every money row now matches its company currency',
            sql: `SELECT NOT EXISTS (SELECT 1 FROM (${CURRENCIES}) u JOIN "public"."companies" c ON c."id" = u."companyId" WHERE c."currency" <> u."currency") AS "result"`,
            params: [],
          },
        ],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'companies',
        constraint: 'company_currency_de87c3c6',
        expression: "\"currency\" IN ('ILS','USD','EUR','JOD')",
      }),
      this.addUnique({
        schema: 'public',
        table: 'companies',
        constraint: 'companies_id_currency_key',
        columns: ['id', 'currency'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cod_collections',
        index: 'cod_collections_companyId_currency_idx_00c76a95',
        columns: ['companyId', 'currency'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'delivery_zones',
        index: 'delivery_zones_companyId_currency_idx_00c76a95',
        columns: ['companyId', 'currency'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_ledger_entries',
        index: 'merchant_ledger_entries_companyId_currency_idx_00c76a95',
        columns: ['companyId', 'currency'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_plans',
        index: 'merchant_plans_companyId_currency_idx_00c76a95',
        columns: ['companyId', 'currency'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_settlement_requests',
        index: 'merchant_settlement_requests_companyId_currency_idx_00c76a95',
        columns: ['companyId', 'currency'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_settlements',
        index: 'merchant_settlements_companyId_currency_idx_00c76a95',
        columns: ['companyId', 'currency'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchants',
        index: 'merchants_companyId_currency_idx_00c76a95',
        columns: ['companyId', 'currency'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'settlement_payments',
        index: 'settlement_payments_companyId_currency_idx_00c76a95',
        columns: ['companyId', 'currency'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'shipments',
        index: 'shipments_companyId_currency_idx_00c76a95',
        columns: ['companyId', 'currency'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cod_collections',
        foreignKey: {
          name: 'cod_collections_companyId_currency_fkey',
          columns: ['companyId', 'currency'],
          references: { schema: 'public', table: 'companies', columns: ['id', 'currency'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'delivery_zones',
        foreignKey: {
          name: 'delivery_zones_companyId_currency_fkey',
          columns: ['companyId', 'currency'],
          references: { schema: 'public', table: 'companies', columns: ['id', 'currency'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_ledger_entries',
        foreignKey: {
          name: 'merchant_ledger_entries_companyId_currency_fkey',
          columns: ['companyId', 'currency'],
          references: { schema: 'public', table: 'companies', columns: ['id', 'currency'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_plans',
        foreignKey: {
          name: 'merchant_plans_companyId_currency_fkey',
          columns: ['companyId', 'currency'],
          references: { schema: 'public', table: 'companies', columns: ['id', 'currency'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_settlement_requests',
        foreignKey: {
          name: 'merchant_settlement_requests_companyId_currency_fkey',
          columns: ['companyId', 'currency'],
          references: { schema: 'public', table: 'companies', columns: ['id', 'currency'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_settlements',
        foreignKey: {
          name: 'merchant_settlements_companyId_currency_fkey',
          columns: ['companyId', 'currency'],
          references: { schema: 'public', table: 'companies', columns: ['id', 'currency'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchants',
        foreignKey: {
          name: 'merchants_companyId_currency_fkey',
          columns: ['companyId', 'currency'],
          references: { schema: 'public', table: 'companies', columns: ['id', 'currency'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'settlement_payments',
        foreignKey: {
          name: 'settlement_payments_companyId_currency_fkey',
          columns: ['companyId', 'currency'],
          references: { schema: 'public', table: 'companies', columns: ['id', 'currency'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'shipments',
        foreignKey: {
          name: 'shipments_companyId_currency_fkey',
          columns: ['companyId', 'currency'],
          references: { schema: 'public', table: 'companies', columns: ['id', 'currency'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
