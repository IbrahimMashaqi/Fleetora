import { describe, expect, it } from 'vitest';
import contract from './generated/contract.json' with { type: 'json' };
import previous from '../../migrations/snapshots/fa391c311e88c3733c41bb73f1161357fd40294661abf95dfb84b6d3084fea2f/contract.json' with { type: 'json' };
describe('OD-15 additive platform persistence', () => {
  const tables = contract.storage.namespaces.public.entries.table;
  it('preserves the exact storage of every existing company, identity and operational table', () => {
    for (const [name, table] of Object.entries(
      previous.storage.namespaces.public.entries.table,
    ))
      expect(tables, name).toHaveProperty(name, table);
  });
  it('keeps platform identity unique, bootstrap singleton and token hashes unique without company ownership', () => {
    expect(tables.platform_staff.uniques).toContainEqual({
      columns: ['userId'],
    });
    expect(tables.platform_invitations.uniques).toContainEqual({
      columns: ['bootstrapKey'],
    });
    expect(tables.platform_invitations.uniques).toContainEqual({
      columns: ['tokenHash'],
    });
    for (const table of [
      tables.platform_staff,
      tables.platform_invitations,
      tables.platform_access_events,
    ])
      expect(table.columns).not.toHaveProperty('companyId');
  });
});
