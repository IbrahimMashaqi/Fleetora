import { describe, expect, it } from 'vitest';
import contract from './generated/contract.json' with { type: 'json' };

type Table = {
  columns: Record<string, { nullable: boolean; default?: unknown }>;
  uniques: { columns: string[] }[];
  checks: { expression: string; prefix?: string }[];
  foreignKeys: {
    source: { columns: string[] };
    target: { tableName: string; columns: string[] };
  }[];
};
const tables = contract.storage.namespaces.public.entries.table as unknown as Record<
  string,
  Table
>;

// OD-02 / BR-066 / FR-PL-06: one currency per company.
const MONEY_TABLES = [
  'merchants',
  'merchant_plans',
  'delivery_zones',
  'shipments',
  'cod_collections',
  'merchant_ledger_entries',
  'merchant_settlements',
  'settlement_payments',
  'merchant_settlement_requests',
];

describe('OD-02/BR-066 company currency contract', () => {
  it('stores one required, allow-listed currency on each company', () => {
    expect(tables.companies.columns.currency).toMatchObject({
      nullable: false,
      default: { kind: 'literal', value: 'ILS' },
    });
    expect(tables.companies.uniques).toContainEqual(
      expect.objectContaining({ columns: ['id', 'currency'] }),
    );
    const check = tables.companies.checks.find((c) =>
      c.expression.includes('"currency"'),
    );
    expect(check?.expression.match(/'[A-Z]{3}'/g)?.sort()).toEqual([
      "'EUR'",
      "'ILS'",
      "'JOD'",
      "'USD'",
    ]);
  });

  it.each(MONEY_TABLES)(
    '%s.currency must equal its company currency (composite foreign key)',
    (name) => {
      expect(tables[name].foreignKeys).toContainEqual(
        expect.objectContaining({
          source: expect.objectContaining({ columns: ['companyId', 'currency'] }),
          target: expect.objectContaining({
            tableName: 'companies',
            columns: ['id', 'currency'],
          }),
        }),
      );
    },
  );

  it('covers every table that stores a currency', () => {
    const withCurrency = Object.entries(tables)
      .filter(([name, table]) => name !== 'companies' && 'currency' in table.columns)
      .map(([name]) => name)
      .sort();
    expect(withCurrency).toEqual([...MONEY_TABLES].sort());
  });
});
