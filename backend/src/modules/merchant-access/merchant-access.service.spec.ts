import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Temporal } from 'temporal-polyfill';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MerchantAccessRepository } from './merchant-access.repository.js';
import { MerchantAccessService } from './merchant-access.service.js';
import { MERCHANT_PERMISSIONS } from './merchant-access.types.js';

const credentials = vi.hoisted(() => ({ compare: vi.fn(), hash: vi.fn() }));
vi.mock('bcrypt', () => credentials);

describe('merchant invitation and access security', () => {
  const token = 'a'.repeat(64);
  const user = {
    id: 'user',
    companyId: 'company',
    role: 'MERCHANT',
    isActive: true,
    isEmailVerified: true,
    email: 'owner@example.invalid',
    password: 'original-hash',
  };
  const membership = {
    id: 'membership',
    userId: user.id,
    companyId: 'company',
    merchantId: 'merchant',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    permissions: ['PARCEL_VIEW'],
  };
  const invite = {
    id: 'invite',
    companyId: 'company',
    merchantId: 'merchant',
    email: user.email,
    role: 'EMPLOYEE',
    permissions: ['PARCEL_VIEW'],
    expiresAt: Temporal.Now.instant().add({ hours: 1 }),
    acceptedAt: null,
    revokedAt: null,
    createdAt: Temporal.Now.instant(),
    tokenHash: 'hash',
  };
  const query = () => ({
    first: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    all: vi.fn(),
    where: vi.fn(),
    select: vi.fn(),
    include: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  });
  const orm = {
    User: query(),
    Company: query(),
    Merchant: query(),
    MerchantMembership: query(),
    MerchantInvitation: query(),
    MerchantAccessEvent: query(),
  };
  const repository = {
    orm,
    transaction: vi.fn(),
    lockUser: vi.fn(),
    lockMembership: vi.fn(),
    lockMerchant: vi.fn(),
    lockInvitation: vi.fn(),
    audit: vi.fn(),
  };
  let service: MerchantAccessService;
  beforeEach(async () => {
    vi.resetAllMocks();
    for (const q of Object.values(orm))
      for (const method of [
        'where',
        'select',
        'include',
        'orderBy',
        'limit',
      ] as const)
        q[method].mockReturnValue(q);
    orm.User.first.mockResolvedValue({ ...user });
    orm.Company.first.mockResolvedValue({ id: 'company', suspended: false });
    orm.Merchant.first.mockResolvedValue({
      id: 'merchant',
      companyId: 'company',
      active: true,
    });
    orm.MerchantMembership.first.mockResolvedValue({ ...membership });
    orm.MerchantInvitation.first.mockResolvedValue({ ...invite });
    orm.MerchantInvitation.create.mockImplementation(async (data) => ({
      ...invite,
      ...data,
    }));
    orm.User.create.mockImplementation(async (data) => ({ ...user, ...data }));
    repository.transaction.mockImplementation(async (_companyId, operation) =>
      operation({ orm: { public: orm } }),
    );
    credentials.compare.mockResolvedValue(true);
    credentials.hash.mockResolvedValue('new-account-hash');
    const module = await Test.createTestingModule({
      providers: [
        MerchantAccessService,
        { provide: MerchantAccessRepository, useValue: repository },
        { provide: ConfigService, useValue: { get: () => 4 } },
      ],
    }).compile();
    service = module.get(MerchantAccessService);
  });

  it('uses persisted identity and scopes membership to its company', async () => {
    await expect(
      service.resolve({ sub: 'user' }, 'PARCEL_VIEW'),
    ).resolves.toMatchObject({
      companyId: 'company',
      merchantId: 'merchant',
      owner: false,
    });
    expect(orm.MerchantMembership.where).toHaveBeenCalledWith({
      userId: 'user',
      companyId: 'company',
      status: 'ACTIVE',
    });
  });
  it('denies ordinary employee financial access', async () => {
    await expect(
      service.resolve({ sub: 'user' }, 'FINANCE_VIEW'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.resolve({ sub: 'user' }, 'SETTLEMENT_REQUEST'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('gives owner explicit capabilities and still checks tenant state', async () => {
    orm.MerchantMembership.first.mockResolvedValue({
      ...membership,
      role: 'OWNER',
    });
    await expect(
      service.resolve({ sub: 'user' }, 'FINANCE_VIEW'),
    ).resolves.toMatchObject({
      owner: true,
      permissions: [...MERCHANT_PERMISSIONS],
    });
    orm.Company.first.mockResolvedValue({ suspended: true });
    await expect(service.resolve({ sub: 'user' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('denies revoked memberships and inactive merchants', async () => {
    orm.MerchantMembership.first.mockResolvedValueOnce(null);
    await expect(service.resolve({ sub: 'user' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    orm.Merchant.first.mockResolvedValueOnce({ active: false });
    await expect(service.resolve({ sub: 'user' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('denies inactive/unverified users and staff roles', async () => {
    orm.User.first.mockResolvedValueOnce({ ...user, isActive: false });
    await expect(service.resolve({ sub: 'user' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    orm.User.first.mockResolvedValueOnce({ ...user, isEmailVerified: false });
    await expect(service.resolve({ sub: 'user' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    orm.User.first.mockResolvedValueOnce({ ...user, role: 'COMPANY_ADMIN' });
    await expect(service.resolve({ sub: 'user' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('prevents employees from issuing invitations', async () => {
    await expect(
      service.issueByOwner(
        { sub: 'user' },
        { email: 'employee@example.invalid' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(orm.MerchantInvitation.create).not.toHaveBeenCalled();
  });
  it('issues random expiring hash-only tokens with zero employee defaults', async () => {
    orm.User.first.mockResolvedValue({ ...user, role: 'COMPANY_ADMIN' });
    const result = await service.issueByAdmin({ sub: 'user' }, 'merchant', {
      email: 'Employee@Example.invalid',
      role: 'EMPLOYEE',
    });
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(result.delivery).toBe('MANUAL');
    expect(result).not.toHaveProperty('tokenHash');
    expect(orm.MerchantInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company',
        merchantId: 'merchant',
        email: 'employee@example.invalid',
        permissions: [],
        tokenHash: expect.not.stringMatching(result.token),
      }),
    );
  });
  it('does not issue an owner invitation if an active owner exists', async () => {
    orm.User.first.mockResolvedValue({ ...user, role: 'COMPANY_ADMIN' });
    await expect(
      service.issueByAdmin({ sub: 'user' }, 'merchant', {
        email: 'new@example.invalid',
        role: 'OWNER',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects invitations for merchants outside the company', async () => {
    orm.User.first.mockResolvedValue({ ...user, role: 'COMPANY_ADMIN' });
    orm.Merchant.first.mockResolvedValue(null);
    await expect(
      service.issueByAdmin({ sub: 'user' }, 'foreign', {
        email: 'new@example.invalid',
        role: 'EMPLOYEE',
      }),
    ).rejects.toThrow('Merchant not found');
    expect(orm.Merchant.where).toHaveBeenCalledWith({
      id: 'foreign',
      companyId: 'company',
      active: true,
    });
  });
  it('rejects existing-account takeover by invitation alone', async () => {
    credentials.compare.mockResolvedValue(false);
    await expect(
      service.accept({ token, password: 'NewPassword' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repository.transaction).not.toHaveBeenCalled();
    expect(orm.User.update).not.toHaveBeenCalled();
  });
  it.each(['revoked', 'expired', 'accepted'])(
    'rejects %s invitations without creating membership',
    async (state) => {
      orm.MerchantInvitation.first.mockResolvedValue({
        ...invite,
        revokedAt: state === 'revoked' ? Temporal.Now.instant() : null,
        acceptedAt: state === 'accepted' ? Temporal.Now.instant() : null,
        expiresAt:
          state === 'expired'
            ? Temporal.Now.instant().subtract({ hours: 1 })
            : invite.expiresAt,
      });
      await expect(
        service.accept({ token, password: 'Password' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(orm.MerchantMembership.create).not.toHaveBeenCalled();
    },
  );
  it('rejects existing identity with another company affiliation', async () => {
    orm.User.first.mockResolvedValue({ ...user, companyId: 'foreign-company' });
    await expect(
      service.accept({ token, password: 'Password' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects membership reuse rather than moving a person to another merchant', async () => {
    await expect(
      service.accept({ token, password: 'Password' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(orm.MerchantMembership.create).not.toHaveBeenCalled();
  });
  it('binds verified existing identity without overwriting its password', async () => {
    orm.MerchantMembership.first.mockResolvedValue(null);
    await expect(
      service.accept({ token, password: 'Password' }),
    ).resolves.toMatchObject({
      accepted: true,
      companyId: 'company',
      merchantId: 'merchant',
    });
    expect(orm.User.update).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company', refreshToken: null }),
    );
    expect(orm.User.update.mock.calls[0][0]).not.toHaveProperty('password');
    expect(orm.MerchantInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({ acceptedById: 'user' }),
    );
  });
  it('creates a verified new account and atomically consumes invitation', async () => {
    orm.User.first.mockResolvedValue(null);
    orm.MerchantMembership.first.mockResolvedValue(null);
    await expect(
      service.accept({ token, name: 'New Merchant', password: 'NewPass1' }),
    ).resolves.toMatchObject({ accepted: true });
    expect(orm.User.create).toHaveBeenCalledWith(
      expect.objectContaining({
        password: 'new-account-hash',
        isEmailVerified: true,
        role: 'MERCHANT',
        companyId: 'company',
      }),
    );
    expect(repository.audit).toHaveBeenCalledWith(
      expect.anything(),
      'company',
      'merchant',
      'user',
      'INVITATION_ACCEPTED',
      expect.anything(),
    );
  });
  it('prevents owner removal through employee management', async () => {
    orm.MerchantMembership.first.mockResolvedValue({
      ...membership,
      role: 'OWNER',
    });
    await expect(
      service.updateEmployee({ sub: 'user' }, 'membership', { active: false }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('revokes employee membership without changing identity ownership', async () => {
    orm.MerchantMembership.first
      .mockResolvedValueOnce({ ...membership, role: 'OWNER' })
      .mockResolvedValueOnce({ ...membership, role: 'OWNER' });
    const result = await service.updateEmployee({ sub: 'user' }, 'employee', {
      active: false,
      permissions: [],
    });
    expect(result).toEqual({
      id: 'employee',
      status: 'REVOKED',
      permissions: [],
    });
    expect(orm.MerchantMembership.where).toHaveBeenCalledWith({
      id: 'employee',
      companyId: 'company',
      merchantId: 'merchant',
    });
    expect(orm.User.update).not.toHaveBeenCalled();
  });
});
