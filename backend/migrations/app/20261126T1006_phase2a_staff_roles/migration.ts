#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/2ff1b08107872ba334fb1b73e951c3137ffe67ad5ebc122ef5f6d3a4710496ce/contract';
import endContract from '../../snapshots/2ff1b08107872ba334fb1b73e951c3137ffe67ad5ebc122ef5f6d3a4710496ce/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/708f9e2ed66bf132dfef0f2d340877256f07cf5e8d8c71398a4a29290afe4280/contract';
import startContract from '../../snapshots/708f9e2ed66bf132dfef0f2d340877256f07cf5e8d8c71398a4a29290afe4280/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'staff_invitations',
        constraint: 'staff_invitation_state_ad4af2ce',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'users',
        constraint: 'users_role_check_8e96eaf0',
      }),
      this.createTable({
        schema: 'public',
        table: 'staff_access_events',
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
          col('subjectId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'staff_invitations',
        constraint: 'staff_invitation_state_5eb9b453',
        expression:
          '"role" IN (\'COMPANY_ADMIN\',\'ACCOUNTANT\',\'OPERATIONS\',\'WAREHOUSE\') AND NOT ("acceptedAt" IS NOT NULL AND "revokedAt" IS NOT NULL) AND (("acceptedAt" IS NULL AND "acceptedById" IS NULL) OR ("acceptedAt" IS NOT NULL AND "acceptedById" IS NOT NULL)) AND (("revokedAt" IS NULL AND "revokedById" IS NULL) OR ("revokedAt" IS NOT NULL AND "revokedById" IS NOT NULL))',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'users',
        constraint: 'users_role_check_57499776',
        expression:
          "\"role\" IN ('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'MERCHANT', 'ACCOUNTANT', 'OPERATIONS', 'WAREHOUSE')",
      }),
      this.createIndex({
        schema: 'public',
        table: 'staff_access_events',
        index: 'staff_access_events_companyId_createdAt_idx_5377e5d5',
        columns: ['companyId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'staff_access_events',
        index: 'staff_access_events_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'staff_access_events',
        foreignKey: {
          name: 'staff_access_events_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
