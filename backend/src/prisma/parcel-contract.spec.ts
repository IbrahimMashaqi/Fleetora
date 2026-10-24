import { describe, expect, it } from 'vitest';
import contract from './generated/contract.json' with { type: 'json' };
import previous from '../../migrations/snapshots/9a81be706b19e625d323a75966347489edab4d41d74b73b445d7392c5989323c/contract.json' with { type: 'json' };
const current: Record<string, unknown> =
  contract.storage.namespaces.public.entries.table;
const tables = contract.storage.namespaces.public.entries.table;
describe('parcel persistence compatibility and invariants', () => {
  it('preserves every unrelated table exactly, including identity and live tracking', () => {
    for (const [name, table] of Object.entries(
      previous.storage.namespaces.public.entries.table,
    )) {
      if (name === 'users') {
        // Phase1 adds an explicitly required tenant-aware merchant identity key.
        expect(tables.users.columns).toEqual(table.columns);
        expect(tables.users.primaryKey).toEqual(table.primaryKey);
        expect(tables.users.foreignKeys).toEqual(table.foreignKeys);
        expect(tables.users.indexes).toEqual(expect.arrayContaining(table.indexes));
        expect(tables.users.uniques).toEqual(expect.arrayContaining(table.uniques));
        expect(tables.users.uniques).toContainEqual({ columns: ['id','companyId'] });
      } else if (!['shipments', 'shipment_history', 'warehouses'].includes(name))
        expect(current[name], name).toEqual(table);
    }
  });
  it('preserves each preexisting shipment/history column and keeps additions backward compatible', () => {
    for (const [name, column] of Object.entries(
      previous.storage.namespaces.public.entries.table.shipments.columns,
    ))
      expect(tables.shipments.columns).toHaveProperty(name, column);
    for (const [name, column] of Object.entries(
      previous.storage.namespaces.public.entries.table.shipment_history.columns,
    ))
      expect(tables.shipment_history.columns).toHaveProperty(name, column);
    const oldNames = new Set(
      Object.keys(
        previous.storage.namespaces.public.entries.table.shipments.columns,
      ),
    );
    for (const [name, column] of Object.entries(tables.shipments.columns))
      if (!oldNames.has(name))
        expect(column.nullable || 'default' in column, name).toBe(true);
    expect(tables.shipments.primaryKey).toEqual(
      previous.storage.namespaces.public.entries.table.shipments.primaryKey,
    );
    expect(tables.shipment_history.foreignKeys).toEqual(
      previous.storage.namespaces.public.entries.table.shipment_history
        .foreignKeys,
    );
  });
  it('preserves all old operational statuses, priority constraints and indexes', () => {
    const old = previous.storage.namespaces.public.entries.table.shipments;
    expect(tables.shipments.indexes).toEqual(
      expect.arrayContaining(old.indexes),
    );
    const status = tables.shipments.checks.find(
      (check) => check.prefix === 'shipments_status_check',
    );
    for (const check of old.checks) {
      if (check.prefix === 'shipments_status_check')
        for (const value of check.expression.match(/'[^']+'/g) ?? [])
          expect(status?.expression).toContain(value);
      else expect(tables.shipments.checks).toContainEqual(check);
    }
  });
  it('strengthens shipment merchant/driver/warehouse relationships with company context while retaining requester identity', () => {
    for (const [column, target] of [
      ['workerId', 'workers'],
      ['warehouseId', 'warehouses'],
      ['merchantId', 'merchants'],
    ])
      expect(tables.shipments.foreignKeys).toContainEqual(
        expect.objectContaining({
          source: expect.objectContaining({ columns: [column, 'companyId'] }),
          target: expect.objectContaining({
            tableName: target,
            columns: ['id', 'companyId'],
          }),
        }),
      );
    const requester =
      previous.storage.namespaces.public.entries.table.shipments.foreignKeys.find(
        (fk) => fk.source.columns.includes('requestedBy'),
      );
    expect(tables.shipments.foreignKeys).toContainEqual(requester);
    expect({
      ...tables.warehouses,
      uniques:
        previous.storage.namespaces.public.entries.table.warehouses.uniques,
    }).toEqual(previous.storage.namespaces.public.entries.table.warehouses);
    expect(tables.warehouses.uniques).toContainEqual({
      columns: ['id', 'companyId'],
    });
  });
  it('protects money signs, coordinates, immutable posting uniqueness and one collection/remittance/payment allocation', () => {
    expect(tables.shipments.checks).toContainEqual(
      expect.objectContaining({
        expression: expect.stringContaining('"attemptCount" >= 0'),
      }),
    );
    expect(tables.shipments.checks).toContainEqual(
      expect.objectContaining({
        expression: expect.stringContaining('"declaredValueMinor" >= 0'),
      }),
    );
    expect(tables.shipments.checks).toContainEqual(
      expect.objectContaining({
        expression: expect.stringContaining('"latitude" BETWEEN -90 AND 90'),
      }),
    );
    expect(tables.merchant_ledger_entries.uniques).toContainEqual({
      columns: ['companyId', 'postingKey'],
    });
    expect(tables.merchant_ledger_entries.uniques).toContainEqual({
      columns: ['originalId'],
    });
    expect(tables.cod_collections.uniques).toContainEqual({
      columns: ['shipmentId'],
    });
    expect(tables.cash_remittances.uniques).toContainEqual({
      columns: ['collectionId'],
    });
    expect(tables.settlement_allocations.uniques).toContainEqual({
      columns: ['ledgerEntryId'],
    });
    expect(tables.settlement_payments.uniques).toContainEqual({
      columns: ['settlementId'],
    });
    expect(tables.merchant_ledger_entries.checks).toContainEqual(
      expect.objectContaining({
        expression: expect.stringContaining('"amountMinor" < 0'),
      }),
    );
  });
  it('carries company in every new relational reference between company-owned records', () => {
    for (const [name, table] of Object.entries(tables)) {
      if (Object.hasOwn(previous.storage.namespaces.public.entries.table, name))
        continue;
      for (const foreignKey of table.foreignKeys)
        if (foreignKey.target.tableName !== 'companies')
          expect(
            foreignKey.source.columns,
            `${name}->${foreignKey.target.tableName}`,
          ).toContain('companyId');
    }
  });
});
