import 'temporal-polyfill/full/global';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Temporal } from 'temporal-polyfill';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { AuthorizationContextRepository } from '../src/modules/auth/authorization-context/authorization-context.repository.js';
import { AuthorizationContextService } from '../src/modules/auth/authorization-context/authorization-context.service.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';

// Opt-in suite only. Existing auth-integration setup requires explicit permission
// and a local test-only database/role. The additive schema must be deployed there.
const companyId = '77777777-7777-4777-8777-777777777771';
const otherCompanyId = '77777777-7777-4777-8777-777777777772';
const userId = '88888888-8888-4888-8888-888888888881';
const otherUserId = '88888888-8888-4888-8888-888888888882';
const platformUserId = '88888888-8888-4888-8888-888888888883';
const missingId = '88888888-8888-4888-8888-888888888889';
const fixtureUserIds = [userId, otherUserId, platformUserId];
const revokedAt = Temporal.Instant.from('2026-01-01T00:00:00Z');
const grantMetadataViolation = {
  kind: 'sql_query',
  sqlState: '23514',
  constraint: expect.stringMatching(
    /^platform_admin_grants_revocation_state_[a-f0-9]{8}$/,
  ),
};
const activeMembershipViolation = {
  kind: 'sql_query',
  sqlState: '23505',
  constraint: expect.stringMatching(
    /^company_memberships_one_active_user_[a-f0-9]{8}$/,
  ),
};

describe('authorization persistence constraints (disposable PostgreSQL)', () => {
  let prisma: PrismaService;
  let repository: AuthorizationContextRepository;
  let service: AuthorizationContextService;
  const databaseGuard = new AuthPostgresTestGuard();

  beforeAll(async () => {
    prisma = new PrismaService();
    await databaseGuard.verify(() => readAuthPostgresIdentity(prisma));
    repository = new AuthorizationContextRepository(prisma);
    service = new AuthorizationContextService(repository);
  });

  async function cleanup() {
    databaseGuard.assertVerified();
    // Remove every fixture grant before any referenced issuer/revoker identity.
    for (const id of fixtureUserIds) {
      await prisma.db.orm.public.PlatformAdminGrant.where({
        userId: id,
      }).delete();
      await prisma.db.orm.public.CompanyMembership.where({
        userId: id,
      }).deleteAndCount();
    }
    for (const id of fixtureUserIds) await prisma.User.where({ id }).delete();
    await prisma.Company.where({ id: companyId }).delete();
    await prisma.Company.where({ id: otherCompanyId }).delete();
  }

  beforeEach(async () => {
    databaseGuard.assertVerified();
    await databaseGuard.verify(() => readAuthPostgresIdentity(prisma));
    await cleanup();
    await prisma.Company.create({ id: companyId, name: 'Phase7B1 Auth Test' });
    await prisma.Company.create({
      id: otherCompanyId,
      name: 'Phase7B1 Other Test',
    });
    await prisma.User.create({
      id: userId,
      companyId,
      fullName: 'Authorization Constraint Fixture',
      email: 'phase7b1-authorization@fleetora.test',
      role: 'COMPANY_ADMIN',
      password: 'unused-test-only-password-hash',
      isActive: true,
      isEmailVerified: true,
    });
    await prisma.User.create({
      id: otherUserId,
      companyId: otherCompanyId,
      fullName: 'Other Company Fixture',
      role: 'COMPANY_ADMIN',
      password: 'unused-test-only-password-hash',
      isActive: true,
      isEmailVerified: true,
    });
    await prisma.User.create({
      id: platformUserId,
      companyId: null,
      fullName: 'Platform Fixture',
      role: 'PLATFORM_ADMIN',
      password: 'unused-test-only-password-hash',
      isActive: true,
      isEmailVerified: true,
    });
  });

  afterAll(async () => {
    await databaseGuard.teardown(async () => {
      await databaseGuard.verify(() => readAuthPostgresIdentity(prisma));
      await cleanup();
    }, async () => {
      await prisma?.db.close();
    });
  });

  it('rejects a second active affiliation in another company', async () => {
    await prisma.db.orm.public.CompanyMembership.create({
      userId,
      companyId,
      principalType: 'STAFF',
      status: 'ACTIVE',
    });
    await expect(
      prisma.db.orm.public.CompanyMembership.create({
        userId,
        companyId: otherCompanyId,
        principalType: 'STAFF',
        status: 'ACTIVE',
      }),
    ).rejects.toMatchObject(activeMembershipViolation);
    const active = await prisma.db.orm.public.CompanyMembership.where({
      userId,
      status: 'ACTIVE',
    })
      .all()
      .toArray();
    expect(active).toHaveLength(1);
    expect(active[0].companyId).toBe(companyId);
  });

  it('rejects activation of historical membership while another affiliation is active', async () => {
    await prisma.db.orm.public.CompanyMembership.create({
      userId,
      companyId,
      principalType: 'STAFF',
      status: 'ACTIVE',
    });
    const inactive = await prisma.db.orm.public.CompanyMembership.create({
      userId,
      companyId: otherCompanyId,
      principalType: 'STAFF',
      status: 'INACTIVE',
    });
    await expect(
      prisma.db.orm.public.CompanyMembership.where({ id: inactive.id }).update({
        status: 'ACTIVE',
      }),
    ).rejects.toMatchObject(activeMembershipViolation);
    await expect(
      prisma.db.orm.public.CompanyMembership.where({ id: inactive.id }).first(),
    ).resolves.toMatchObject({ status: 'INACTIVE' });
  });

  it('permits at most one of two concurrent active membership inserts', async () => {
    const results = await Promise.allSettled([
      prisma.db.orm.public.CompanyMembership.create({
        userId,
        companyId,
        principalType: 'STAFF',
        status: 'ACTIVE',
      }),
      prisma.db.orm.public.CompanyMembership.create({
        userId,
        companyId: otherCompanyId,
        principalType: 'STAFF',
        status: 'ACTIVE',
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.reason).toMatchObject(activeMembershipViolation);
    const active = await prisma.db.orm.public.CompanyMembership.where({
      userId,
      status: 'ACTIVE',
    })
      .all()
      .toArray();
    expect(active).toHaveLength(1);
  });

  it('retains repeated revoked and inactive history alongside one active affiliation', async () => {
    for (const status of ['REVOKED', 'REVOKED', 'INACTIVE'] as const) {
      await prisma.db.orm.public.CompanyMembership.create({
        userId,
        companyId,
        principalType: 'STAFF',
        status,
      });
    }
    await prisma.db.orm.public.CompanyMembership.create({
      userId,
      companyId: otherCompanyId,
      principalType: 'STAFF',
      status: 'ACTIVE',
    });
    const history = await prisma.db.orm.public.CompanyMembership.where({
      userId,
    })
      .all()
      .toArray();
    expect(history).toHaveLength(4);
    expect(new Set(history.map((membership) => membership.id)).size).toBe(4);
    expect(
      history.filter((membership) => membership.status === 'REVOKED'),
    ).toHaveLength(2);
    expect(
      history.filter((membership) => membership.status === 'ACTIVE'),
    ).toHaveLength(1);
  });

  it('cleans all fixture membership history before deleting its user', async () => {
    for (const status of ['REVOKED', 'REVOKED', 'INACTIVE', 'ACTIVE'] as const) {
      await prisma.db.orm.public.CompanyMembership.create({
        userId, companyId, principalType: 'STAFF', status,
      });
    }
    await databaseGuard.verify(() => readAuthPostgresIdentity(prisma));
    await cleanup();
    await expect(prisma.db.orm.public.CompanyMembership.where({ userId }).all().toArray())
      .resolves.toEqual([]);
    await expect(prisma.User.where({ id: userId }).first()).resolves.toBeNull();
  });

  it('rejects a second grant for the same subject, including a revoked grant', async () => {
    const first = await prisma.db.orm.public.PlatformAdminGrant.create({
      userId: platformUserId,
      status: 'ACTIVE',
    });
    await expect(
      prisma.db.orm.public.PlatformAdminGrant.create({
        userId: platformUserId,
        status: 'REVOKED',
        revokedAt,
      }),
    ).rejects.toMatchObject({
      kind: 'sql_query',
      sqlState: '23505',
      constraint: 'platform_admin_grants_userId_key',
    });
    const grants = await prisma.db.orm.public.PlatformAdminGrant.where({
      userId: platformUserId,
    })
      .all()
      .toArray();
    expect(grants).toHaveLength(1);
    expect(grants[0].id).toBe(first.id);
    expect(grants[0].status).toBe('ACTIVE');
  });

  it.each([
    {
      label: 'ACTIVE with timestamp',
      status: 'ACTIVE' as const,
      revokedAt,
      revokedById: null,
    },
    {
      label: 'ACTIVE with revoker',
      status: 'ACTIVE' as const,
      revokedAt: null,
      revokedById: userId,
    },
    {
      label: 'ACTIVE with both revocation fields',
      status: 'ACTIVE' as const,
      revokedAt,
      revokedById: userId,
    },
    {
      label: 'REVOKED without timestamp',
      status: 'REVOKED' as const,
      revokedAt: null,
      revokedById: null,
    },
    {
      label: 'REVOKED with revoker but no timestamp',
      status: 'REVOKED' as const,
      revokedAt: null,
      revokedById: userId,
    },
  ])(
    'rejects inconsistent grant metadata: $label',
    async ({ label: _label, ...metadata }) => {
      await expect(
        prisma.db.orm.public.PlatformAdminGrant.create({
          userId: platformUserId,
          ...metadata,
        }),
      ).rejects.toMatchObject(grantMetadataViolation);
      await expect(
        prisma.db.orm.public.PlatformAdminGrant.where({
          userId: platformUserId,
        }).first(),
      ).resolves.toBeNull();
    },
  );

  it('rejects an invalid revocation update without changing the active grant', async () => {
    const grant = await prisma.db.orm.public.PlatformAdminGrant.create({
      userId: platformUserId,
      status: 'ACTIVE',
    });
    await expect(
      prisma.db.orm.public.PlatformAdminGrant.where({ id: grant.id }).update({
        status: 'REVOKED',
      }),
    ).rejects.toMatchObject(grantMetadataViolation);
    await expect(
      prisma.db.orm.public.PlatformAdminGrant.where({ id: grant.id }).first(),
    ).resolves.toMatchObject({
      status: 'ACTIVE',
      revokedAt: null,
      revokedById: null,
    });
  });

  it.each([null, userId])(
    'accepts a revoked grant with timestamp and optional revoker: %s',
    async (revokedById) => {
      const grant = await prisma.db.orm.public.PlatformAdminGrant.create({
        userId: platformUserId,
        status: 'REVOKED',
        revokedAt,
        revokedById,
      });
      const persisted = await prisma.db.orm.public.PlatformAdminGrant.where({
        id: grant.id,
      }).first();
      expect(persisted?.status).toBe('REVOKED');
      expect(persisted?.revokedAt?.toString()).toBe('2026-01-01T00:00:00Z');
      expect(persisted?.revokedById).toBe(revokedById);
    },
  );

  it.each(['userId', 'grantedById', 'revokedById'] as const)(
    'rejects a grant with a missing %s reference',
    async (field) => {
      await expect(
        prisma.db.orm.public.PlatformAdminGrant.create({
          userId: platformUserId,
          status: 'REVOKED',
          revokedAt,
          [field]: missingId,
        }),
      ).rejects.toMatchObject({
        kind: 'sql_query',
        sqlState: '23503',
        constraint: `platform_admin_grants_${field}_fkey`,
      });
    },
  );

  it.each([
    { id: platformUserId, field: 'userId' },
    { id: userId, field: 'grantedById' },
    { id: otherUserId, field: 'revokedById' },
  ])(
    'restricts deletion of the referenced grant $field user',
    async ({ id, field }) => {
      await prisma.db.orm.public.PlatformAdminGrant.create({
        userId: platformUserId,
        status: 'REVOKED',
        revokedAt,
        grantedById: userId,
        revokedById: otherUserId,
      });
      await expect(prisma.User.where({ id }).delete()).rejects.toMatchObject({
        kind: 'sql_query',
        sqlState: '23001', // ON DELETE RESTRICT, not a missing FK on insert.
        constraint: `platform_admin_grants_${field}_fkey`,
      });
      await expect(prisma.User.where({ id }).first()).resolves.toMatchObject({
        id,
      });
    },
  );

  it.each(['userId', 'companyId'] as const)(
    'rejects a membership with a missing %s reference',
    async (field) => {
      await expect(
        prisma.db.orm.public.CompanyMembership.create({
          userId,
          companyId,
          principalType: 'STAFF',
          [field]: missingId,
        }),
      ).rejects.toMatchObject({
        kind: 'sql_query',
        sqlState: '23503',
        constraint: `company_memberships_${field}_fkey`,
      });
    },
  );

  it.each(['user', 'company'] as const)(
    'retains membership history when deleting its %s is attempted',
    async (target) => {
      // Isolate the company restriction from legacy Company -> User cascading.
      await prisma.User.where({ id: userId }).update({ companyId: null });
      const membership = await prisma.db.orm.public.CompanyMembership.create({
        userId,
        companyId,
        principalType: 'STAFF',
        status: 'REVOKED',
      });
      const deletion =
        target === 'user'
          ? prisma.User.where({ id: userId }).delete()
          : prisma.Company.where({ id: companyId }).delete();
      await expect(deletion).rejects.toMatchObject({
        kind: 'sql_query',
        sqlState: '23001', // Keep historical rows protected by RESTRICT.
        constraint: `company_memberships_${target === 'user' ? 'userId' : 'companyId'}_fkey`,
      });
      await expect(
        prisma.db.orm.public.CompanyMembership.where({
          id: membership.id,
        }).first(),
      ).resolves.toMatchObject({ status: 'REVOKED' });
    },
  );

  it('hydrates only the requested user with membership companies and historical rows', async () => {
    const active = await prisma.db.orm.public.CompanyMembership.create({
      userId,
      companyId,
      status: 'ACTIVE',
      principalType: 'STAFF',
    });
    const historical = await prisma.db.orm.public.CompanyMembership.create({
      userId,
      companyId: otherCompanyId,
      status: 'REVOKED',
      principalType: 'STAFF',
    });
    const other = await prisma.db.orm.public.CompanyMembership.create({
      userId: otherUserId,
      companyId: otherCompanyId,
      status: 'ACTIVE',
      principalType: 'MERCHANT',
    });
    const state = await repository.findByUserId(userId);
    expect(state).toMatchObject({
      id: userId,
      isActive: true,
      isEmailVerified: true,
      platformAdminGrant: null,
    });
    expect(state?.companyMemberships).toHaveLength(2);
    expect(state?.companyMemberships).toEqual(
      expect.arrayContaining([
        {
          id: active.id,
          userId,
          companyId,
          status: 'ACTIVE',
          principalType: 'STAFF',
          company: { id: companyId, suspended: false },
        },
        {
          id: historical.id,
          userId,
          companyId: otherCompanyId,
          status: 'REVOKED',
          principalType: 'STAFF',
          company: { id: otherCompanyId, suspended: false },
        },
      ]),
    );
    expect(state).not.toHaveProperty('password');
    expect(state).not.toHaveProperty('refreshToken');
    const otherState = await repository.findByUserId(otherUserId);
    expect(otherState?.companyMemberships).toEqual([
      {
        id: other.id,
        userId: otherUserId,
        companyId: otherCompanyId,
        status: 'ACTIVE',
        principalType: 'MERCHANT',
        company: { id: otherCompanyId, suspended: false },
      },
    ]);
    await expect(repository.findByUserId(missingId)).resolves.toBeNull();
  });

  it('hydrates explicit platform authority and denies automatic company access', async () => {
    const grant = await prisma.db.orm.public.PlatformAdminGrant.create({
      userId: platformUserId,
      status: 'ACTIVE',
      grantedById: userId,
    });
    const state = await repository.findByUserId(platformUserId);
    expect(state?.companyMemberships).toEqual([]);
    expect(state?.platformAdminGrant).toEqual({
      id: grant.id,
      userId: platformUserId,
      status: 'ACTIVE',
      revokedAt: null,
      revokedById: null,
    });
    await expect(
      service.resolvePlatform({ sub: platformUserId }),
    ).resolves.toEqual({
      kind: 'platform',
      userId: platformUserId,
      grantId: grant.id,
    });
    await expect(
      service.resolveCompany({ sub: platformUserId }, companyId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves persisted company A scope and denies company B and platform scope', async () => {
    const membership = await prisma.db.orm.public.CompanyMembership.create({
      userId,
      companyId,
      status: 'ACTIVE',
      principalType: 'STAFF',
    });
    await prisma.db.orm.public.CompanyMembership.create({
      userId,
      companyId: otherCompanyId,
      status: 'INACTIVE',
      principalType: 'STAFF',
    });
    await expect(
      service.resolveCompany({ sub: userId }, companyId),
    ).resolves.toEqual({
      kind: 'company',
      userId,
      membershipId: membership.id,
      companyId,
      principalType: 'STAFF',
    });
    await expect(
      service.resolveCompany({ sub: userId }, otherCompanyId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.resolvePlatform({ sub: userId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a company immediately after persisted suspension', async () => {
    await prisma.db.orm.public.CompanyMembership.create({
      userId,
      companyId,
      status: 'ACTIVE',
      principalType: 'STAFF',
    });
    await expect(
      service.resolveCompany({ sub: userId }, companyId),
    ).resolves.toMatchObject({ companyId });
    await prisma.Company.where({ id: companyId }).update({ suspended: true });
    await expect(
      service.resolveCompany({ sub: userId }, companyId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['INACTIVE', 'REVOKED'] as const)(
    'denies persisted %s membership without legacy fallback',
    async (status) => {
      const membership = await prisma.db.orm.public.CompanyMembership.create({
        userId,
        companyId,
        status: 'ACTIVE',
        principalType: 'STAFF',
      });
      await expect(
        service.resolveCompany({ sub: userId }, companyId),
      ).resolves.toMatchObject({ companyId });
      await prisma.db.orm.public.CompanyMembership.where({
        id: membership.id,
      }).update({ status });
      await expect(
        service.resolveCompany({ sub: userId }, companyId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('denies revoked persisted platform authority despite the legacy platform role', async () => {
    const grant = await prisma.db.orm.public.PlatformAdminGrant.create({
      userId: platformUserId,
      status: 'ACTIVE',
    });
    await expect(
      service.resolvePlatform({ sub: platformUserId }),
    ).resolves.toMatchObject({ grantId: grant.id });
    await prisma.db.orm.public.PlatformAdminGrant.where({
      id: grant.id,
    }).update({ status: 'REVOKED', revokedAt, revokedById: userId });
    const state = await repository.findByUserId(platformUserId);
    expect(state?.platformAdminGrant?.revokedAt?.toString()).toBe(
      '2026-01-01T00:00:00Z',
    );
    expect(state?.platformAdminGrant?.revokedById).toBe(userId);
    await expect(
      service.resolvePlatform({ sub: platformUserId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed for simultaneous persisted active platform and company authority', async () => {
    await prisma.db.orm.public.CompanyMembership.create({
      userId,
      companyId,
      status: 'ACTIVE',
      principalType: 'STAFF',
    });
    await prisma.db.orm.public.PlatformAdminGrant.create({
      userId,
      status: 'ACTIVE',
    });
    await expect(
      service.resolveCompany({ sub: userId }, companyId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.resolvePlatform({ sub: userId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['isActive', 'isEmailVerified'] as const)(
    'denies persisted false %s on both resolution paths',
    async (field) => {
      await prisma.db.orm.public.CompanyMembership.create({
        userId,
        companyId,
        status: 'ACTIVE',
        principalType: 'STAFF',
      });
      await prisma.db.orm.public.PlatformAdminGrant.create({
        userId: platformUserId,
        status: 'ACTIVE',
      });
      await prisma.User.where({ id: userId }).update({ [field]: false });
      await prisma.User.where({ id: platformUserId }).update({
        [field]: false,
      });
      await expect(
        service.resolveCompany({ sub: userId }, companyId),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        service.resolvePlatform({ sub: platformUserId }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );
});
