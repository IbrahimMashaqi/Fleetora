#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0328f315880d04eab0a0ce5d8b2efc6fdffcf52118257626b22e32c21907ef67/contract';
import endContract from '../../snapshots/0328f315880d04eab0a0ce5d8b2efc6fdffcf52118257626b22e32c21907ef67/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f3715185aafae91ad66bca609d42540daa21b5b2aeef17f6a8e7688711482eac/contract';
import startContract from '../../snapshots/f3715185aafae91ad66bca609d42540daa21b5b2aeef17f6a8e7688711482eac/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'warehouses',
        column: col('archivedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
