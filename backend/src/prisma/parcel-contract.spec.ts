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
        const { authVersion, ...columns } = tables.users.columns;
        expect(authVersion).toMatchObject({ nativeType: 'int4', nullable: false });
        expect(authVersion).toHaveProperty('default');
        expect(columns).toEqual(table.columns);
        expect(tables.users.primaryKey).toEqual(table.primaryKey);
        expect(tables.users.foreignKeys).toEqual(table.foreignKeys);
        expect(tables.users.indexes).toEqual(expect.arrayContaining(table.indexes));
        expect(tables.users.uniques).toEqual(expect.arrayContaining(table.uniques));
        expect(tables.users.uniques).toContainEqual({ columns: ['id','companyId'] });
      } else if (name === 'companies') {
        // OD-02 adds only the company currency, its (id,currency) key and its check.
        const { currency, approvalStatus, rejectionReason, phone, address, revision, accessVersion, primaryAdminId, ...columns } = tables.companies.columns;
        for (const column of [approvalStatus,rejectionReason,phone,address,revision,accessVersion,primaryAdminId]) expect(column.nullable || "default" in column).toBe(true);
        expect(currency).toBeDefined();
        expect(columns).toEqual(table.columns);
        expect(tables.companies.primaryKey).toEqual(table.primaryKey);
        expect(tables.companies.foreignKeys).toEqual(expect.arrayContaining(table.foreignKeys));
        expect(tables.companies.indexes).toEqual(expect.arrayContaining(table.indexes));
        expect(tables.companies.uniques).toEqual([
          ...table.uniques,
          { columns: ['id', 'currency'] },
        ]);
      } else if (name === 'workers') {
        const { offboardedAt, ...columns } = tables.workers.columns;
        expect(offboardedAt.nullable).toBe(true);
        expect({ ...tables.workers, columns }).toEqual(table);
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
  it('preserves all old operational statuses and indexes', () => {
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
      // OD-10 deliberately narrows the priority check; asserted below.
      else if (check.prefix !== 'shipments_priority_check')
        expect(tables.shipments.checks).toContainEqual(check);
    }
  });
  it('OD-10/BR-083: limits stored priority to NORMAL, HIGH and URGENT', () => {
    const priority = tables.shipments.checks.filter(
      (check) => check.prefix === 'shipments_priority_check',
    );
    expect(priority).toHaveLength(1);
    expect(priority[0].expression.match(/'[^']+'/g)?.sort()).toEqual([
      "'HIGH'",
      "'NORMAL'",
      "'URGENT'",
    ]);
    expect(tables.shipments.columns.priority).toMatchObject({
      nullable: false,
      default: { kind: 'literal', value: 'NORMAL' },
    });
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
    const oldWarehouses =
      previous.storage.namespaces.public.entries.table.warehouses;
    expect({
      ...tables.warehouses,
      columns: oldWarehouses.columns,
      uniques: oldWarehouses.uniques,
    }).toEqual(oldWarehouses);
    for (const [name, column] of Object.entries(oldWarehouses.columns))
      expect(tables.warehouses.columns).toHaveProperty(name, column);
    // Later additions (archivedAt) must stay nullable so existing rows remain valid.
    for (const [name, column] of Object.entries(tables.warehouses.columns))
      if (!(name in oldWarehouses.columns))
        expect(column.nullable, name).toBe(true);
    expect(tables.warehouses.columns).toHaveProperty('archivedAt');
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
      // OD-15 adds platform-owned identity records, deliberately without a tenant.
      // Unknown unscoped tables still fail; platform references may only name identities.
      if (!Object.hasOwn(table.columns, 'companyId')) {
        expect(['platform_staff', 'platform_invitations', 'platform_access_events']).toContain(name);
        for (const foreignKey of table.foreignKeys) {
          expect(foreignKey.target.tableName).toBe('users');
          expect(foreignKey.source.columns).toEqual(['userId']);
          expect(foreignKey).toHaveProperty('onDelete', 'restrict');
        }
        continue;
      }
      for (const foreignKey of table.foreignKeys)
        if (foreignKey.target.tableName !== 'companies')
          expect(
            foreignKey.source.columns,
            `${name}->${foreignKey.target.tableName}`,
          ).toContain('companyId');
    }
  });
});
