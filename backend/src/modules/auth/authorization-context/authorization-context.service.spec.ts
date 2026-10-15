import { Test } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Temporal } from 'temporal-polyfill';
import { AuthorizationContextService } from './authorization-context.service.js';
import { AuthorizationContextRepository } from './authorization-context.repository.js';
import type { AuthorizationState } from './authorization-context.repository.js';

type Membership = AuthorizationState['companyMemberships'][number];
type Grant = NonNullable<AuthorizationState['platformAdminGrant']>;

const identity = { sub: 'user-1' };
const membership = (overrides: Partial<Membership> = {}): Membership => ({
  id: 'membership-1',
  userId: 'user-1',
  companyId: 'company-1',
  status: 'ACTIVE',
  principalType: 'STAFF',
  company: { id: 'company-1', suspended: false },
  ...overrides,
});
const grant = (overrides: Partial<Grant> = {}): Grant => ({
  id: 'grant-1',
  userId: 'user-1',
  status: 'ACTIVE',
  revokedAt: null,
  revokedById: null,
  ...overrides,
});

describe('internal persisted authorization context', () => {
  let state: AuthorizationState;
  let service: AuthorizationContextService;
  const findByUserId =
    vi.fn<(id: string) => Promise<AuthorizationState | null>>();

  beforeEach(async () => {
    state = {
      id: 'user-1',
      isActive: true,
      isEmailVerified: true,
      companyMemberships: [],
      platformAdminGrant: null,
    };
    findByUserId
      .mockReset()
      .mockImplementation(async (id) => (id === state.id ? state : null));
    const module = await Test.createTestingModule({
      providers: [
        AuthorizationContextService,
        { provide: AuthorizationContextRepository, useValue: { findByUserId } },
      ],
    }).compile();
    service = module.get(AuthorizationContextService);
  });

  it('resolves explicit active platform authority without company access', async () => {
    state.platformAdminGrant = grant();
    await expect(service.resolvePlatform(identity)).resolves.toEqual({
      kind: 'platform',
      userId: 'user-1',
      grantId: 'grant-1',
    });
    await expect(
      service.resolveCompany(identity, 'company-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves a company administrator affiliation as staff without inventing RBAC grants', async () => {
    state.companyMemberships = [membership()];
    await expect(
      service.resolveCompany(identity, 'company-1'),
    ).resolves.toEqual({
      kind: 'company',
      userId: 'user-1',
      membershipId: 'membership-1',
      companyId: 'company-1',
      principalType: 'STAFF',
    });
  });

  it('never treats a company membership as platform authority', async () => {
    state.companyMemberships = [membership()];
    await expect(service.resolvePlatform(identity)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects conflicting active platform and company participation on both paths', async () => {
    state.platformAdminGrant = grant();
    state.companyMemberships = [membership()];
    await expect(service.resolvePlatform(identity)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.resolveCompany(identity, 'company-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  for (const stateChange of ['inactive', 'unverified'] as const) {
    it(`rejects an ${stateChange} identity on both paths`, async () => {
      state.platformAdminGrant = grant();
      if (stateChange === 'inactive') state.isActive = false;
      else state.isEmailVerified = false;
      await expect(service.resolvePlatform(identity)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      state.platformAdminGrant = null;
      state.companyMemberships = [membership()];
      await expect(
        service.resolveCompany(identity, 'company-1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  }

  it('rejects suspended company access', async () => {
    state.companyMemberships = [
      membership({ company: { id: 'company-1', suspended: true } }),
    ];
    await expect(
      service.resolveCompany(identity, 'company-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  for (const status of ['INACTIVE', 'REVOKED'] as const) {
    it(`rejects ${status.toLowerCase()} membership without a legacy fallback`, async () => {
      state.companyMemberships = [membership({ status })];
      const legacyIdentity = {
        sub: 'user-1',
        role: 'COMPANY_ADMIN',
        orgId: 'company-1',
      };
      await expect(
        service.resolveCompany(legacyIdentity, 'company-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  }

  it('fails closed when company affiliation or requested company context is absent', async () => {
    await expect(
      service.resolveCompany(identity, 'company-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    state.companyMemberships = [membership()];
    await expect(service.resolveCompany(identity, '')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a different company even when submitted claims name that company', async () => {
    state.companyMemberships = [membership()];
    const forgedScope = {
      sub: 'user-1',
      role: 'PLATFORM_ADMIN',
      orgId: 'company-2',
    };
    await expect(
      service.resolveCompany(forgedScope, 'company-2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed if stored data violates the one-active-membership invariant', async () => {
    state.companyMemberships = [
      membership(),
      membership({
        id: 'membership-2',
        companyId: 'company-2',
        company: { id: 'company-2', suspended: false },
      }),
    ];
    await expect(
      service.resolveCompany(identity, 'company-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ignores revoked affiliation history when resolving the one active membership', async () => {
    state.companyMemberships = [
      membership({ id: 'old-1', status: 'REVOKED' }),
      membership({ id: 'old-2', status: 'INACTIVE' }),
      membership(),
    ];
    await expect(
      service.resolveCompany(identity, 'company-1'),
    ).resolves.toMatchObject({ membershipId: 'membership-1' });
  });

  for (const principalType of ['MERCHANT', 'DRIVER'] as const) {
    it(`preserves ${principalType.toLowerCase()} principal type without employee permissions`, async () => {
      state.companyMemberships = [membership({ principalType })];
      await expect(
        service.resolveCompany(identity, 'company-1'),
      ).resolves.toEqual({
        kind: 'company',
        userId: 'user-1',
        membershipId: 'membership-1',
        companyId: 'company-1',
        principalType,
      });
    });
  }

  it('rejects revoked platform authority', async () => {
    state.platformAdminGrant = grant({
      status: 'REVOKED',
      revokedAt: Temporal.Instant.from('2026-01-01T00:00:00Z'),
    });
    await expect(service.resolvePlatform(identity)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects inconsistent grant revocation metadata', async () => {
    state.platformAdminGrant = grant({
      revokedAt: Temporal.Instant.from('2026-01-01T00:00:00Z'),
    });
    await expect(service.resolvePlatform(identity)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects active platform authority with a revocation actor but no timestamp', async () => {
    state.platformAdminGrant = grant({ revokedById: 'revoker-1' });
    await expect(service.resolvePlatform(identity)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects mismatched membership identity', async () => {
    state.companyMemberships = [membership({ userId: 'someone-else' })];
    await expect(
      service.resolveCompany(identity, 'company-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects mismatched related company', async () => {
    state.companyMemberships = [
      membership({ company: { id: 'company-2', suspended: false } }),
    ];
    await expect(
      service.resolveCompany(identity, 'company-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects mismatched platform grant identity', async () => {
    state.platformAdminGrant = grant({ userId: 'someone-else' });
    await expect(service.resolvePlatform(identity)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects missing identity and empty validated subject', async () => {
    await expect(
      service.resolvePlatform({ sub: 'missing' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.resolveCompany({ sub: '' }, 'company-1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a repository result for another authenticated subject', async () => {
    findByUserId.mockResolvedValue({ ...state, id: 'someone-else' });
    await expect(service.resolvePlatform(identity)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('propagates unavailable persistence instead of accepting submitted authority', async () => {
    findByUserId.mockRejectedValue(new Error('persistence unavailable'));
    await expect(service.resolvePlatform({ sub: 'user-1' })).rejects.toThrow(
      'persistence unavailable',
    );
  });
});
