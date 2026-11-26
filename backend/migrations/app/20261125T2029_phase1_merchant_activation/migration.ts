#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/708f9e2ed66bf132dfef0f2d340877256f07cf5e8d8c71398a4a29290afe4280/contract';
import endContract from '../../snapshots/708f9e2ed66bf132dfef0f2d340877256f07cf5e8d8c71398a4a29290afe4280/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c8a9d6da8ad8dccf886dbbbdc8ef3564762b631b3fcc5c988586be2b5daa9a2c/contract';
import startContract from '../../snapshots/c8a9d6da8ad8dccf886dbbbdc8ef3564762b631b3fcc5c988586be2b5daa9a2c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'merchants',
        column: col('activationStatus', 'text', {
          notNull: true,
          default: lit('PENDING'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'merchants',
        column: col('agreementAcceptedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'merchants',
        column: col('agreementAcceptedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'merchants',
        column: col('agreementTerms', 'json', { codecRef: { codecId: 'pg/json@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'merchants',
        column: col('legacyActivation', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      // OD-13, owner decision Q13 (option A): merchants that already exist keep operating.
      // They become ACTIVE and are marked legacy because no acceptance was ever recorded.
      // Only merchants created after this migration start PENDING.
      rawSql({
        id: 'data.merchants.legacy_activation',
        label: 'Mark existing merchants ACTIVE (legacy, no recorded acceptance)',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: { schema: 'public', objectType: 'table', name: 'merchants' },
        },
        precheck: [],
        execute: [
          {
            description: 'activate every pre-existing merchant as legacy',
            sql: `UPDATE "public"."merchants" SET "activationStatus" = 'ACTIVE', "legacyActivation" = true`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'ensure no pre-existing merchant was left PENDING',
            sql: `SELECT NOT EXISTS (SELECT 1 FROM "public"."merchants" WHERE "activationStatus" <> 'ACTIVE' OR NOT "legacyActivation") AS "result"`,
            params: [],
          },
        ],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'merchants',
        constraint: 'merchant_activation_state_35cfd541',
        expression:
          '("activationStatus" = \'PENDING\' AND NOT "legacyActivation" AND "agreementAcceptedAt" IS NULL AND "agreementAcceptedById" IS NULL AND "agreementTerms" IS NULL) OR ("activationStatus" = \'ACTIVE\' AND (("legacyActivation" AND "agreementAcceptedAt" IS NULL AND "agreementAcceptedById" IS NULL AND "agreementTerms" IS NULL) OR (NOT "legacyActivation" AND "agreementAcceptedAt" IS NOT NULL AND "agreementAcceptedById" IS NOT NULL AND "agreementTerms" IS NOT NULL)))',
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
