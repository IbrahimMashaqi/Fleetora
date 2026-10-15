import { describe, expect, it } from 'vitest';
import contract from './generated/contract.json' with { type: 'json' };
import legacyContract from '../../migrations/snapshots/316de1e8d9642428af4648bcae6927da9aa3df855b50b4a3456412f7e40dd902/contract.json' with { type: 'json' };

// Offline contract checks: PostgreSQL enforcement still requires a disposable DB.
const tables: Record<string, unknown> =
  contract.storage.namespaces.public.entries.table;

describe('additive authorization persistence contract', () => {
  it('enforces one active membership per identity across companies', () => {
    expect(tables.company_memberships).toMatchObject({
      indexes: expect.arrayContaining([
        expect.objectContaining({
          columns: ['userId'],
          unique: true,
          where: '"status" = \'ACTIVE\'',
        }),
      ]),
    });
  });

  it('permits multiple historical memberships rather than globally uniquing userId', () => {
    const uniqueIndexes =
      contract.storage.namespaces.public.entries.table.company_memberships.indexes.filter(
        (index) => 'unique' in index && index.unique,
      );
    expect(uniqueIndexes).toHaveLength(1);
    expect(tables.company_memberships).toMatchObject({
      primaryKey: { columns: ['id'] },
      uniques: [],
      columns: {
        status: { default: { kind: 'literal', value: 'INACTIVE' } },
      },
    });
  });

  it('restricts deletion of platform grant subjects, issuers and revokers', () => {
    expect(tables.platform_admin_grants).toMatchObject({
      foreignKeys: expect.arrayContaining(
        ['userId', 'grantedById', 'revokedById'].map((column) =>
          expect.objectContaining({
            onDelete: 'restrict',
            source: expect.objectContaining({ columns: [column] }),
            target: expect.objectContaining({
              tableName: 'users',
              columns: ['id'],
            }),
          }),
        ),
      ),
    });
  });

  it('preserves the complete storage definition of every legacy table', () => {
    for (const [name, table] of Object.entries(
      legacyContract.storage.namespaces.public.entries.table,
    )) {
      expect(tables[name], name).toEqual(table);
    }
  });

  it('requires identity and company references without cascading away membership history', () => {
    expect(tables.company_memberships).toMatchObject({
      foreignKeys: expect.arrayContaining([
        expect.objectContaining({
          onDelete: 'restrict',
          source: expect.objectContaining({ columns: ['userId'] }),
          target: expect.objectContaining({
            tableName: 'users',
            columns: ['id'],
          }),
        }),
        expect.objectContaining({
          onDelete: 'restrict',
          source: expect.objectContaining({ columns: ['companyId'] }),
          target: expect.objectContaining({
            tableName: 'companies',
            columns: ['id'],
          }),
        }),
      ]),
    });
  });

  it('keeps platform grants identity-owned with a unique subject and revocation state', () => {
    expect(tables.platform_admin_grants).toMatchObject({
      uniques: expect.arrayContaining([{ columns: ['userId'] }]),
      columns: {
        status: { nullable: false },
        grantedById: { nullable: true },
        revokedById: { nullable: true },
        revokedAt: { nullable: true },
      },
      checks: expect.arrayContaining([
        expect.objectContaining({
          expression:
            '("status" = \'ACTIVE\' AND "revokedAt" IS NULL AND "revokedById" IS NULL) OR ("status" = \'REVOKED\' AND "revokedAt" IS NOT NULL)',
        }),
      ]),
    });
  });

  it('preserves all existing identity, company, password and token storage', () => {
    expect(tables.users).toMatchObject({
      primaryKey: { columns: ['id'] },
      columns: {
        role: { nullable: false },
        companyId: { nullable: true },
        password: { nullable: false },
        refreshToken: { nullable: true },
        isActive: { nullable: false },
        isEmailVerified: { nullable: false },
      },
    });
    expect(tables.companies).toMatchObject({ primaryKey: { columns: ['id'] } });
  });
});
