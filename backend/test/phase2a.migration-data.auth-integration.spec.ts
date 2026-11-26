import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';
describe('Phase 2a additive driver identity migration', () => {
  const guard = new AuthPostgresTestGuard();
  let prisma: PrismaService;
  beforeAll(async () => {
    prisma = new PrismaService();
    await guard.verify(() => readAuthPostgresIdentity(prisma));
  });
  afterAll(async () => {
    await prisma?.db.close();
  });
  it('preserves existing staff access without assigning new roles or invalidating their credentials', async () => {
    const users = await prisma.User.where({
      companyId: 'phase2a-migration-company',
    })
      .orderBy((u) => u.id.asc())
      .all();
    expect(
      users.map((u) => ({
        role: u.role,
        active: u.isActive,
        version: u.authVersion,
        password: u.password,
      })),
    ).toEqual([
      {
        role: 'ACCOUNTANT',
        active: true,
        version: 0,
        password: 'unusable fixture password',
      },
      {
        role: 'COMPANY_ADMIN',
        active: true,
        version: 0,
        password: 'unusable fixture password',
      },
    ]);
  });
  it('leaves duplicate-phone Workers distinct, suspended/history states unchanged and all identities unlinked', async () => {
    const workers = await prisma.Worker.where({
      companyId: 'phase2a-migration-company',
    })
      .orderBy((w) => w.id.asc())
      .all();
    expect(workers).toHaveLength(2);
    expect(workers.map((w) => [w.phone, w.status, w.offboardedAt])).toEqual([
      ['0591234567', 'SUSPENDED', null],
      ['0591234567', 'OFFLINE', null],
    ]);
    expect(
      await prisma.db.orm.public.DriverAccount.where({
        companyId: 'phase2a-migration-company',
      }).all(),
    ).toEqual([]);
  });
});
