import { describe, expect, it } from 'vitest';
import contract from './generated/contract.json' with { type: 'json' };
import previous from '../../migrations/snapshots/229f7301133a8fb5405ab776de74cea418da9d41a4044c6c44b57ef3c54910f4/contract.json' with { type: 'json' };
describe('BR-045/047/068 additive company lifecycle storage', () => {
  const tables = contract.storage.namespaces.public.entries.table;
  it('preserves every preexisting table, column, key, index and constraint', () => {
    for (const [name, old] of Object.entries(
      previous.storage.namespaces.public.entries.table,
    )) {
      if (name !== 'companies') {
        expect(tables).toHaveProperty(name, old);
        continue;
      }
      for (const [column, value] of Object.entries(old.columns))
        expect(tables.companies.columns).toHaveProperty(column, value);
      expect(tables.companies.primaryKey).toEqual(old.primaryKey);
      const legacy = previous.storage.namespaces.public.entries.table.companies;
      expect(tables.companies.foreignKeys).toEqual(
        expect.arrayContaining(legacy.foreignKeys),
      );
      expect(tables.companies.indexes).toEqual(
        expect.arrayContaining(legacy.indexes),
      );
      expect(tables.companies.uniques).toEqual(
        expect.arrayContaining(legacy.uniques),
      );
      expect(tables.companies.checks).toEqual(
        expect.arrayContaining(legacy.checks),
      );
    }
  });
  it('allows legacy rows without rewrites and enforces tenant linkage and single-use token constraints', () => {
    const oldColumns =
      previous.storage.namespaces.public.entries.table.companies.columns;
    for (const [name, column] of Object.entries(tables.companies.columns))
      if (!(name in oldColumns))
        expect(column.nullable || 'default' in column, name).toBe(true);
    expect(tables.companies.columns.approvalStatus.default).toEqual({
      kind: 'literal',
      value: 'ACTIVE',
    });
    expect(tables.company_admin_invitations.uniques).toContainEqual({
      columns: ['tokenHash'],
    });
    expect(tables.company_admin_invitations.foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: expect.objectContaining({ columns: ['userId', 'companyId'] }),
          target: expect.objectContaining({
            tableName: 'users',
            columns: ['id', 'companyId'],
          }),
        }),
      ]),
    );
    expect(
      tables.company_admin_invitations.checks.some(
        (c) =>
          c.expression.includes('acceptedAt') &&
          c.expression.includes('revokedAt'),
      ),
    ).toBe(true);
  });
});
