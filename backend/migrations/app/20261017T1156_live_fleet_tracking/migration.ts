#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/3dfdcd69d14fa5c5906a7720fd95d7cf6474d1535434f04efb18f0250c404303/contract';
import startContract from '../../snapshots/3dfdcd69d14fa5c5906a7720fd95d7cf6474d1535434f04efb18f0250c404303/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9a81be706b19e625d323a75966347489edab4d41d74b73b445d7392c5989323c/contract';
import endContract from '../../snapshots/9a81be706b19e625d323a75966347489edab4d41d74b73b445d7392c5989323c/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations(): Migration<Start, End>['operations'] {
    return [
      this.createTable({
        schema: 'public',
        table: 'company_headquarters',
        columns: [
          col('address', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('latitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('longitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('revision', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['companyId']),
          checkExpression(
            'company_headquarters_coordinates_3934dade',
            '"latitude" >= -90 AND "latitude" <= 90 AND "longitude" >= -180 AND "longitude" <= 180',
          ),
          checkExpression('company_headquarters_revision_17ec8772', '"revision" > 0'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'driver_tracking_states',
        columns: [
          col('accuracy', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('capturedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('heading', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('latitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('longitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('receivedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('revision', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('sequence', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('sharing', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('sharingSessionId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sharingStartedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('speed', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('workerId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['workerId']),
          checkExpression(
            'driver_tracking_coordinates_17d69af7',
            '("latitude" IS NULL AND "longitude" IS NULL AND "capturedAt" IS NULL AND "receivedAt" IS NULL AND "accuracy" IS NULL AND "speed" IS NULL AND "heading" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "capturedAt" IS NOT NULL AND "receivedAt" IS NOT NULL AND "latitude" >= -90 AND "latitude" <= 90 AND "longitude" >= -180 AND "longitude" <= 180)',
          ),
          checkExpression(
            'driver_tracking_measurements_dc4e9211',
            '"revision" > 0 AND "sequence" >= 0 AND ("accuracy" IS NULL OR ("accuracy" >= 0 AND "accuracy" <= 10000)) AND ("speed" IS NULL OR ("speed" >= 0 AND "speed" <= 100)) AND ("heading" IS NULL OR ("heading" >= 0 AND "heading" < 360))',
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'driver_tracking_states',
        constraint: 'driver_tracking_states_workerId_companyId_key',
        columns: ['workerId', 'companyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'workers',
        constraint: 'workers_id_companyId_key',
        columns: ['id', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'driver_tracking_states',
        index: 'driver_tracking_states_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'company_headquarters',
        foreignKey: {
          name: 'company_headquarters_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'driver_tracking_states',
        foreignKey: {
          name: 'driver_tracking_states_workerId_companyId_fkey',
          columns: ['workerId', 'companyId'],
          references: { schema: 'public', table: 'workers', columns: ['id', 'companyId'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'driver_tracking_states',
        foreignKey: {
          name: 'driver_tracking_states_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
