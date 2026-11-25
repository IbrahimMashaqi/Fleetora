import { beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';

// Rows inserted by test/migration-fixtures/*.sql before the Phase 1 migrations ran.
const priorityCompany = 'd0100000-0000-4000-8000-000000000001';

describe('Phase 1 data migrations against disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await guard.verify(() => readAuthPostgresIdentity(prisma));
  });

  describe('OD-10/BR-083 priority', () => {
    it('migrated existing LOW parcels to NORMAL and kept every other priority', async () => {
      guard.assertVerified();
      const rows = await prisma.db.orm.public.Shipment.where({
        companyId: priorityCompany,
      })
        .select('id', 'priority')
        .all();
      const byId = Object.fromEntries(rows.map((row) => [row.id, row.priority]));
      expect(byId).toEqual({
        'd0100000-0000-4000-8000-0000000000a1': 'NORMAL',
        'd0100000-0000-4000-8000-0000000000a2': 'HIGH',
        'd0100000-0000-4000-8000-0000000000a3': 'URGENT',
        'd0100000-0000-4000-8000-0000000000a4': 'NORMAL',
      });
    });

    it('rejects LOW at the database for inserts and updates', async () => {
      guard.assertVerified();
      const runtime = prisma.db.runtime();
      await expect(
        runtime.query(
          prisma.db.raw.sql`UPDATE "shipments" SET "priority" = 'LOW' WHERE "id" = 'd0100000-0000-4000-8000-0000000000a2' RETURNING "id"`
            .returnsRow({ id: 'pg/text@1' })
            .build(),
        ),
      ).rejects.toThrow(/shipments_priority_check/);
      await expect(
        runtime.query(
          prisma.db.raw.sql`INSERT INTO "shipments" ("id","companyId","requestedBy","destination","priority","updatedAt") VALUES ('d0100000-0000-4000-8000-0000000000b1', 'd0100000-0000-4000-8000-000000000001', 'd0100000-0000-4000-8000-0000000000f1', 'Fictional', 'LOW', now()) RETURNING "id"`
            .returnsRow({ id: 'pg/text@1' })
            .build(),
        ),
      ).rejects.toThrow(/shipments_priority_check/);
    });
  });
});
