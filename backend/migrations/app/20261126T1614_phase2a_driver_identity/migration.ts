#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/2ff1b08107872ba334fb1b73e951c3137ffe67ad5ebc122ef5f6d3a4710496ce/contract';
import startContract from '../../snapshots/2ff1b08107872ba334fb1b73e951c3137ffe67ad5ebc122ef5f6d3a4710496ce/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/fa391c311e88c3733c41bb73f1161357fd40294661abf95dfb84b6d3084fea2f/contract';
import endContract from '../../snapshots/fa391c311e88c3733c41bb73f1161357fd40294661abf95dfb84b6d3084fea2f/contract.json' with { type: 'json' };
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

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'users',
        constraint: 'users_role_check_57499776',
      }),
      this.createTable({
        schema: 'public',
        table: 'driver_access_events',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('details', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('workerId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'driver_accounts',
        columns: [
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('phone', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('workerId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'driver_phone_e164_ae949d68',
            '"phone" ~ \'^\\+(9705[69][0-9]{7}|9725[0-9]{8})$\'',
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'driver_invitations',
        columns: [
          col('acceptedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('issuedById', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('phone', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('revokedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('workerId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'driver_invitation_state_dec73fa1',
            'NOT ("acceptedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)',
          ),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('authVersion', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'workers',
        column: col('offboardedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'driver_accounts',
        constraint: 'driver_accounts_userId_key',
        columns: ['userId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'driver_accounts',
        constraint: 'driver_accounts_workerId_key',
        columns: ['workerId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'driver_accounts',
        constraint: 'driver_accounts_phone_key',
        columns: ['phone'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'driver_accounts',
        constraint: 'driver_accounts_userId_companyId_key',
        columns: ['userId', 'companyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'driver_accounts',
        constraint: 'driver_accounts_workerId_companyId_key',
        columns: ['workerId', 'companyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'driver_invitations',
        constraint: 'driver_invitations_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'users',
        constraint: 'users_role_check_45aad123',
        expression:
          "\"role\" IN ('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'MERCHANT', 'ACCOUNTANT', 'OPERATIONS', 'WAREHOUSE', 'DRIVER')",
      }),
      this.createIndex({
        schema: 'public',
        table: 'driver_access_events',
        index: 'driver_access_events_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'driver_access_events',
        index: 'driver_access_events_companyId_workerId_createdAt_idx_4b9d7965',
        columns: ['companyId', 'workerId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'driver_accounts',
        index: 'driver_accounts_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'driver_invitations',
        index: 'driver_invitations_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'driver_invitations',
        index: 'driver_invitations_companyId_workerId_idx_82008f07',
        columns: ['companyId', 'workerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'driver_invitations',
        index: 'driver_invitations_workerId_companyId_idx_95d2064a',
        columns: ['workerId', 'companyId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'driver_access_events',
        foreignKey: {
          name: 'driver_access_events_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'driver_accounts',
        foreignKey: {
          name: 'driver_accounts_userId_companyId_fkey',
          columns: ['userId', 'companyId'],
          references: { schema: 'public', table: 'users', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'driver_accounts',
        foreignKey: {
          name: 'driver_accounts_workerId_companyId_fkey',
          columns: ['workerId', 'companyId'],
          references: { schema: 'public', table: 'workers', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'driver_accounts',
        foreignKey: {
          name: 'driver_accounts_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'driver_invitations',
        foreignKey: {
          name: 'driver_invitations_workerId_companyId_fkey',
          columns: ['workerId', 'companyId'],
          references: { schema: 'public', table: 'workers', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'driver_invitations',
        foreignKey: {
          name: 'driver_invitations_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
