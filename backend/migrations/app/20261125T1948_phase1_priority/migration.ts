#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/8faca95d054b124a36c5a93ca6fef78946a8653f5f978d2dfb92f881caffe1f3/contract';
import startContract from '../../snapshots/8faca95d054b124a36c5a93ca6fef78946a8653f5f978d2dfb92f881caffe1f3/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f0ba33380248edd4599dfcbb3e7f84bff45cf5c9b67ffe362e8b073a1ef7aa0e/contract';
import endContract from '../../snapshots/f0ba33380248edd4599dfcbb3e7f84bff45cf5c9b67ffe362e8b073a1ef7aa0e/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      // OD-10 (owner-approved 2026-11-25): LOW is retired; existing LOW parcels become
      // NORMAL. NORMAL satisfies both the old and the new check, so this runs first.
      rawSql({
        id: 'data.shipments.priority_low_to_normal',
        label: 'Migrate LOW shipment priority to NORMAL (OD-10)',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: { schema: 'public', objectType: 'table', name: 'shipments' },
        },
        precheck: [],
        execute: [
          {
            description: 'set every LOW priority to NORMAL',
            sql: `UPDATE "public"."shipments" SET "priority" = 'NORMAL' WHERE "priority" = 'LOW'`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'ensure no LOW priority remains',
            sql: `SELECT NOT EXISTS (SELECT 1 FROM "public"."shipments" WHERE "priority" = 'LOW') AS "result"`,
            params: [],
          },
        ],
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'shipments',
        constraint: 'shipments_priority_check_72dbae57',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'shipments',
        constraint: 'shipments_priority_check_c94307fd',
        expression: "\"priority\" IN ('NORMAL', 'HIGH', 'URGENT')",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
