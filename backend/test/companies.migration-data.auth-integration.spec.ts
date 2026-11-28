import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';
describe('OD-16 grandfathering of preexisting companies', () => {
  const guard = new AuthPostgresTestGuard();
  let prisma: PrismaService;
  beforeAll(async () => {
    prisma = new PrismaService();
    await guard.verify(() => readAuthPostgresIdentity(prisma));
  });
  afterAll(async () => {
    await prisma?.db.close();
  });
  it('makes existing companies ACTIVE without clearing suspension or choosing a primary admin', async () => {
    for (const [id, suspended] of [
      ['phase3-legacy-active', false],
      ['phase3-legacy-suspended', true],
    ] as const) {
      const company = await prisma.Company.where({ id }).first();
      expect(company).toMatchObject({
        approvalStatus: 'ACTIVE',
        suspended,
        accessVersion: 0,
        revision: 1,
        primaryAdminId: null,
        rejectionReason: null,
      });
      expect(
        await prisma.db.orm.public.CompanyAdminInvitation.where({
          companyId: id,
        }).all(),
      ).toEqual([]);
      expect(
        await prisma.db.orm.public.CompanyAccessEvent.where({
          companyId: id,
        }).all(),
      ).toEqual([]);
    }
  });
  it('preserves existing staff credentials, authority and suspended Workers', async () => {
    expect(
      await prisma.User.where({ id: 'phase3-legacy-admin' }).first(),
    ).toMatchObject({
      companyId: 'phase3-legacy-active',
      password: 'unusable fixture password',
      role: 'COMPANY_ADMIN',
      isActive: true,
      isEmailVerified: true,
      authVersion: 0,
    });
    expect(
      await prisma.Worker.where({ id: 'phase3-legacy-worker' }).first(),
    ).toMatchObject({
      companyId: 'phase3-legacy-suspended',
      status: 'SUSPENDED',
      phone: '0591234567',
    });
  });
});
