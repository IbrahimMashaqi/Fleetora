#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/0328f315880d04eab0a0ce5d8b2efc6fdffcf52118257626b22e32c21907ef67/contract';
import startContract from '../../snapshots/0328f315880d04eab0a0ce5d8b2efc6fdffcf52118257626b22e32c21907ef67/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/8faca95d054b124a36c5a93ca6fef78946a8653f5f978d2dfb92f881caffe1f3/contract';
import endContract from '../../snapshots/8faca95d054b124a36c5a93ca6fef78946a8653f5f978d2dfb92f881caffe1f3/contract.json' with { type: 'json' };
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
        table: 'staff_invitations',
        columns: [
          col('acceptedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('acceptedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
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
          col('issuedById', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('revokedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('revokedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'staff_invitation_state_ad4af2ce',
            '"role" IN (\'COMPANY_ADMIN\',\'ACCOUNTANT\') AND NOT ("acceptedAt" IS NOT NULL AND "revokedAt" IS NOT NULL) AND (("acceptedAt" IS NULL AND "acceptedById" IS NULL) OR ("acceptedAt" IS NOT NULL AND "acceptedById" IS NOT NULL)) AND (("revokedAt" IS NULL AND "revokedById" IS NULL) OR ("revokedAt" IS NOT NULL AND "revokedById" IS NOT NULL))',
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'staff_invitations',
        constraint: 'staff_invitations_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'staff_invitations',
        index: 'staff_invitations_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'staff_invitations',
        index: 'staff_invitations_company_created_5377e5d5',
        columns: ['companyId', 'createdAt'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'staff_invitations',
        foreignKey: {
          name: 'staff_invitations_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
