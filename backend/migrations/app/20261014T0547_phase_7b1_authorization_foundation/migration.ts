#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/316de1e8d9642428af4648bcae6927da9aa3df855b50b4a3456412f7e40dd902/contract';
import startContract from '../../snapshots/316de1e8d9642428af4648bcae6927da9aa3df855b50b4a3456412f7e40dd902/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/cb732e7410ed221c37e6d0e555810415ba5551ef7b1d2a81c12645466ac8236a/contract';
import endContract from '../../snapshots/cb732e7410ed221c37e6d0e555810415ba5551ef7b1d2a81c12645466ac8236a/contract.json' with { type: 'json' };
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
        table: 'company_memberships',
        columns: [
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('principalType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('INACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'company_memberships_principalType_check_d2343e87',
            "\"principalType\" IN ('STAFF', 'MERCHANT', 'DRIVER')",
          ),
          checkExpression(
            'company_memberships_status_check_7232e080',
            "\"status\" IN ('ACTIVE', 'INACTIVE', 'REVOKED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'platform_admin_grants',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('grantedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('revokedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('revokedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'platform_admin_grants_revocation_state_7d7025f9',
            '("status" = \'ACTIVE\' AND "revokedAt" IS NULL AND "revokedById" IS NULL) OR ("status" = \'REVOKED\' AND "revokedAt" IS NOT NULL)',
          ),
          checkExpression(
            'platform_admin_grants_status_check_35f03e2c',
            "\"status\" IN ('ACTIVE', 'REVOKED')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'platform_admin_grants',
        constraint: 'platform_admin_grants_userId_key',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'company_memberships',
        index: 'company_memberships_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'company_memberships',
        index: 'company_memberships_companyId_status_idx_86f6fb02',
        columns: ['companyId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'company_memberships',
        index: 'company_memberships_one_active_user_0293bafb',
        columns: ['userId'],
        extras: { where: '"status" = \'ACTIVE\'', unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'company_memberships',
        index: 'company_memberships_userId_status_idx_e4a128ba',
        columns: ['userId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'platform_admin_grants',
        index: 'platform_admin_grants_grantedById_idx_416f9b2b',
        columns: ['grantedById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'platform_admin_grants',
        index: 'platform_admin_grants_revokedById_idx_ab374353',
        columns: ['revokedById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'platform_admin_grants',
        index: 'platform_admin_grants_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'company_memberships',
        foreignKey: {
          name: 'company_memberships_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'company_memberships',
        foreignKey: {
          name: 'company_memberships_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'platform_admin_grants',
        foreignKey: {
          name: 'platform_admin_grants_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'platform_admin_grants',
        foreignKey: {
          name: 'platform_admin_grants_grantedById_fkey',
          columns: ['grantedById'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'platform_admin_grants',
        foreignKey: {
          name: 'platform_admin_grants_revokedById_fkey',
          columns: ['revokedById'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
