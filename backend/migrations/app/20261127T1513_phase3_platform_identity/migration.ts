#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/229f7301133a8fb5405ab776de74cea418da9d41a4044c6c44b57ef3c54910f4/contract';
import endContract from '../../snapshots/229f7301133a8fb5405ab776de74cea418da9d41a4044c6c44b57ef3c54910f4/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fa391c311e88c3733c41bb73f1161357fd40294661abf95dfb84b6d3084fea2f/contract';
import startContract from '../../snapshots/fa391c311e88c3733c41bb73f1161357fd40294661abf95dfb84b6d3084fea2f/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'platform_access_events',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actorId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('details', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('subjectId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'platform_invitations',
        columns: [
          col('acceptedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('acceptedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('bootstrapKey', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('issuedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('revokedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'platform_invitation_state_dec73fa1',
            'NOT ("acceptedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)',
          ),
          checkExpression(
            'platform_invitations_role_check_f6b10d42',
            "\"role\" IN ('SUPER_ADMIN', 'COMPANY_MANAGER', 'BILLING', 'SUPPORT')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'platform_staff',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'platform_staff_role_check_f6b10d42',
            "\"role\" IN ('SUPER_ADMIN', 'COMPANY_MANAGER', 'BILLING', 'SUPPORT')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'platform_invitations',
        constraint: 'platform_invitations_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'platform_invitations',
        constraint: 'platform_invitations_bootstrapKey_key',
        columns: ['bootstrapKey'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'platform_staff',
        constraint: 'platform_staff_userId_key',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'platform_access_events',
        index: 'platform_access_events_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'platform_invitations',
        index: 'platform_invitations_email_idx_46df9cad',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'platform_staff',
        index: 'platform_staff_role_idx_2c1ddf83',
        columns: ['role'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'platform_staff',
        foreignKey: {
          name: 'platform_staff_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
