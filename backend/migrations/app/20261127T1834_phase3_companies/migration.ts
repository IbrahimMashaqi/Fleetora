#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/229f7301133a8fb5405ab776de74cea418da9d41a4044c6c44b57ef3c54910f4/contract';
import startContract from '../../snapshots/229f7301133a8fb5405ab776de74cea418da9d41a4044c6c44b57ef3c54910f4/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c1cc3cc93a8d782d6855b05baf59d3f135515ee225fa0f23c3cb1e6d17c885a4/contract';
import endContract from '../../snapshots/c1cc3cc93a8d782d6855b05baf59d3f135515ee225fa0f23c3cb1e6d17c885a4/contract.json' with { type: 'json' };
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
      this.createTable({
        schema: 'public',
        table: 'company_access_events',
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
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'company_admin_invitations',
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
          col('revokedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'company_admin_invitation_state_dec73fa1',
            'NOT ("acceptedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)',
          ),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'companies',
        column: col('accessVersion', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'companies',
        column: col('address', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'companies',
        column: col('approvalStatus', 'text', {
          notNull: true,
          default: lit('ACTIVE'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'companies',
        column: col('phone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'companies',
        column: col('primaryAdminId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'companies',
        column: col('rejectionReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'companies',
        column: col('revision', 'int4', {
          notNull: true,
          default: lit(1),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'companies',
        constraint: 'companies_approvalStatus_check_ef53a045',
        expression: "\"approvalStatus\" IN ('PENDING', 'ACTIVE', 'REJECTED')",
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'companies',
        constraint: 'company_access_revision_20c85f47',
        expression: '"revision" > 0 AND "accessVersion" >= 0',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'companies',
        constraint: 'company_rejection_reason_d624501c',
        expression:
          '"approvalStatus" <> \'REJECTED\' OR ("rejectionReason" IS NOT NULL AND length(btrim("rejectionReason")) BETWEEN 1 AND 500)',
      }),
      this.addUnique({
        schema: 'public',
        table: 'company_admin_invitations',
        constraint: 'company_admin_invitations_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'companies',
        index: 'companies_primaryAdminId_id_idx_617b35ba',
        columns: ['primaryAdminId', 'id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'company_access_events',
        index: 'company_access_events_companyId_createdAt_idx_5377e5d5',
        columns: ['companyId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'company_access_events',
        index: 'company_access_events_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'company_admin_invitations',
        index: 'company_admin_invitations_companyId_createdAt_idx_5377e5d5',
        columns: ['companyId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'company_admin_invitations',
        index: 'company_admin_invitations_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'company_admin_invitations',
        index: 'company_admin_invitations_userId_companyId_idx_172f3a40',
        columns: ['userId', 'companyId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'companies',
        foreignKey: {
          name: 'companies_primaryAdminId_id_fkey',
          columns: ['primaryAdminId', 'id'],
          references: { schema: 'public', table: 'users', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'company_access_events',
        foreignKey: {
          name: 'company_access_events_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'company_admin_invitations',
        foreignKey: {
          name: 'company_admin_invitations_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'company_admin_invitations',
        foreignKey: {
          name: 'company_admin_invitations_userId_companyId_fkey',
          columns: ['userId', 'companyId'],
          references: { schema: 'public', table: 'users', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
