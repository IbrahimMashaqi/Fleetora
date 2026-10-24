#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3dfdcd69d14fa5c5906a7720fd95d7cf6474d1535434f04efb18f0250c404303/contract';
import endContract from '../../snapshots/3dfdcd69d14fa5c5906a7720fd95d7cf6474d1535434f04efb18f0250c404303/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/cb732e7410ed221c37e6d0e555810415ba5551ef7b1d2a81c12645466ac8236a/contract';
import startContract from '../../snapshots/cb732e7410ed221c37e6d0e555810415ba5551ef7b1d2a81c12645466ac8236a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations(): Migration<Start, End>['operations'] {
    return [
      this.addColumn({
        schema: 'public',
        table: 'vehicles',
        column: col('manufacturer', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'vehicles',
        column: col('model', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'vehicles',
        constraint: 'vehicles_companyId_plateNumber_key',
        columns: ['companyId', 'plateNumber'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
