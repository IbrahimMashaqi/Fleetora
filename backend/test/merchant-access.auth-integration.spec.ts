import 'temporal-polyfill/full/global';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MerchantAccessRepository } from '../src/modules/merchant-access/merchant-access.repository.js';
import { MerchantAccessService } from '../src/modules/merchant-access/merchant-access.service.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';

describe('merchant identity on disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  const companies: string[] = [];
  const unattachedUsers: string[] = [];
  const password = 'MerchantPass1';
  let prisma: PrismaService;
  let service: MerchantAccessService;
  let admin: { sub: string };
  let foreignAdmin: { sub: string };
  let companyId: string;
  let merchantId: string;
  let foreignMerchantId: string;
  const email = () => `${randomUUID()}@example.invalid`;

  async function companyFixture() {
    const company = await prisma.Company.create({
      name: 'Isolated merchant access fixture',
    });
    companies.push(company.id);
    const user = await prisma.User.create({
      fullName: 'Invitation issuer',
      email: email(),
      password: 'unused-test-hash',
      companyId: company.id,
      role: 'COMPANY_ADMIN',
      isActive: true,
      isEmailVerified: true,
    });
    const merchant = await prisma.db.orm.public.Merchant.create({
      companyId: company.id,
      name: 'Fixture merchant',
      contactName: 'Fixture owner',
      phone: '+970599000000',
      pickupAddress: 'Fixture address',
      city: 'Fixture city',
      currency: 'ILS',
      deliveryFeeMinor: 1500n,
      returnFeeMinor: 500n,
      serviceFeeMinor: 0n,
      feePayer: 'MERCHANT',
    });
    return {
      companyId: company.id,
      merchantId: merchant.id,
      actor: { sub: user.id },
    };
  }
  async function activate(role: 'OWNER' | 'EMPLOYEE' = 'OWNER') {
    const invitation = await service.issueByAdmin(admin, merchantId, {
      email: email(),
      role,
    });
    const result = await service.accept({
      token: invitation.token,
      name: 'Invited person',
      password,
    });
    const user = await prisma.User.where({ email: result.email }).first();
    if (!user) throw new Error('Accepted identity was not persisted');
    return { user, actor: { sub: user.id }, invitation };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    service = new MerchantAccessService(
      new MerchantAccessRepository(prisma),
      new ConfigService({ SALT_ROUNDS: 4 }),
    );
  });
  beforeEach(async () => {
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    const local = await companyFixture();
    const foreign = await companyFixture();
    companyId = local.companyId;
    merchantId = local.merchantId;
    admin = local.actor;
    foreignAdmin = foreign.actor;
    foreignMerchantId = foreign.merchantId;
  });
  afterAll(async () => {
    await guard.teardown(
      async () => {
        await guard.verify(() => readAuthPostgresIdentity(prisma));
        for (const fixture of companies) {
          await prisma.db.orm.public.MerchantAccessEvent.where({
            companyId: fixture,
          }).deleteAll();
          await prisma.db.orm.public.MerchantInvitation.where({
            companyId: fixture,
          }).deleteAll();
          await prisma.db.orm.public.MerchantMembership.where({
            companyId: fixture,
          }).deleteAll();
          await prisma.db.orm.public.Merchant.where({
            companyId: fixture,
          }).deleteAll();
          await prisma.User.where({ companyId: fixture }).deleteAll();
          await prisma.Company.where({ id: fixture }).delete();
        }
        for (const id of unattachedUsers)
          await prisma.User.where({ id }).delete();
      },
      async () => {
        await prisma?.db.close();
      },
    );
  });

  it('activates an owner and denies token replay while preserving hash-only persistence', async () => {
    const { actor, user, invitation } = await activate();
    expect(user).toMatchObject({
      role: 'MERCHANT',
      companyId,
      isEmailVerified: true,
      isActive: true,
    });
    expect(await bcrypt.compare(password, user.password)).toBe(true);
    expect(await service.resolve(actor, 'FINANCE_VIEW')).toMatchObject({
      merchantId,
      companyId,
      owner: true,
    });
    await expect(
      service.accept({ token: invitation.token, password }),
    ).rejects.toThrow('Invalid or expired invitation');
    const stored = await prisma.db.orm.public.MerchantInvitation.where({
      id: invitation.id,
    }).first();
    expect(stored?.tokenHash).not.toBe(invitation.token);
    const list = await service.invitations(actor);
    expect(list.items[0]).toMatchObject({
      id: invitation.id,
      state: 'ACCEPTED',
    });
    expect(list.items[0]).not.toHaveProperty('tokenHash');
    expect(list.items[0]).not.toHaveProperty('token');
  });

  it('revokes and expires pending invitations without activating an account', async () => {
    const revoked = await service.issueByAdmin(admin, merchantId, {
      email: email(),
      role: 'OWNER',
    });
    await service.revoke(admin, revoked.id, merchantId);
    await expect(
      service.accept({
        token: revoked.token,
        name: 'Revoked recipient',
        password,
      }),
    ).rejects.toThrow('Invalid or expired invitation');
    const expired = await service.issueByAdmin(admin, merchantId, {
      email: email(),
      role: 'OWNER',
    });
    await prisma.db.orm.public.MerchantInvitation.where({
      id: expired.id,
    }).update({ expiresAt: Temporal.Now.instant().subtract({ minutes: 1 }) });
    await expect(
      service.accept({
        token: expired.token,
        name: 'Expired recipient',
        password,
      }),
    ).rejects.toThrow('Invalid or expired invitation');
    expect(
      await prisma.User.where({ email: revoked.email }).first(),
    ).toBeNull();
    expect(
      await prisma.User.where({ email: expired.email }).first(),
    ).toBeNull();
  });

  it('allows only one of two concurrent owner acceptances', async () => {
    const first = await service.issueByAdmin(admin, merchantId, {
      email: email(),
      role: 'OWNER',
    });
    const second = await service.issueByAdmin(admin, merchantId, {
      email: email(),
      role: 'OWNER',
    });
    const results = await Promise.allSettled([
      service.accept({ token: first.token, name: 'Owner one', password }),
      service.accept({ token: second.token, name: 'Owner two', password }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const owners = await prisma.db.orm.public.MerchantMembership.where({
      companyId,
      merchantId,
      role: 'OWNER',
      status: 'ACTIVE',
    }).all();
    expect(owners).toHaveLength(1);
  });

  it('consumes a token atomically when the same acceptance races', async () => {
    const invitation = await service.issueByAdmin(admin, merchantId, {
      email: email(),
      role: 'EMPLOYEE',
    });
    const results = await Promise.allSettled([
      service.accept({
        token: invitation.token,
        name: 'Employee one',
        password,
      }),
      service.accept({
        token: invitation.token,
        name: 'Employee one',
        password,
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await prisma.db.orm.public.MerchantMembership.where({
        companyId,
        merchantId,
      }).all(),
    ).toHaveLength(1);
  });

  it('preserves an existing account password and verifies it before attaching', async () => {
    const storedPassword = await bcrypt.hash('ExistingPass1', 4);
    const existing = await prisma.User.create({
      email: email(),
      fullName: 'Existing identity',
      password: storedPassword,
      role: 'MERCHANT',
      companyId: null,
      isActive: true,
      isEmailVerified: true,
    });
    unattachedUsers.push(existing.id);
    const invitation = await service.issueByAdmin(admin, merchantId, {
      email: existing.email ?? '',
      role: 'OWNER',
    });
    await expect(
      service.accept({ token: invitation.token, password: 'AttackerPass1' }),
    ).rejects.toMatchObject({ status: 401 });
    await service.accept({
      token: invitation.token,
      password: 'ExistingPass1',
    });
    expect(await prisma.User.where({ id: existing.id }).first()).toMatchObject({
      password: storedPassword,
      companyId,
    });
  });

  it('rejects company staff and foreign merchant identifiers on invitation paths', async () => {
    await expect(
      service.issueByAdmin(admin, foreignMerchantId, {
        email: email(),
        role: 'OWNER',
      }),
    ).rejects.toMatchObject({ status: 404 });
    const invitation = await service.issueByAdmin(admin, merchantId, {
      email: email(),
      role: 'OWNER',
    });
    await expect(
      service.revoke(foreignAdmin, invitation.id, foreignMerchantId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.resolve(admin)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('denies cross-company existing identity attachment and merchant reassignment', async () => {
    const owner = await activate();
    const foreignInvite = await service.issueByAdmin(
      foreignAdmin,
      foreignMerchantId,
      { email: owner.user.email ?? '', role: 'OWNER' },
    );
    await expect(
      service.accept({ token: foreignInvite.token, password }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const secondMerchant = await prisma.db.orm.public.Merchant.create({
      companyId,
      name: 'Second fixture merchant',
      contactName: 'Fixture contact',
      phone: '+970599000001',
      pickupAddress: 'Fixture second address',
      city: 'Fixture city',
      currency: 'ILS',
      deliveryFeeMinor: 1500n,
      returnFeeMinor: 0n,
      feePayer: 'MERCHANT',
    });
    const secondInvite = await service.issueByAdmin(admin, secondMerchant.id, {
      email: owner.user.email ?? '',
      role: 'OWNER',
    });
    await expect(
      service.accept({ token: secondInvite.token, password }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await service.resolve(owner.actor)).toMatchObject({
      merchantId,
      companyId,
    });
  });

  it('separates employee financial grants and enforces revocation on the next request', async () => {
    const owner = await activate();
    const invitation = await service.issueByOwner(owner.actor, {
      email: email(),
      permissions: ['PARCEL_VIEW'],
    });
    const accepted = await service.accept({
      token: invitation.token,
      name: 'Employee',
      password,
    });
    const employee = await prisma.User.where({ email: accepted.email }).first();
    if (!employee) throw new Error('Employee identity not persisted');
    const actor = { sub: employee.id };
    const context = await service.resolve(actor, 'PARCEL_VIEW');
    await expect(service.resolve(actor, 'FINANCE_VIEW')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.resolve(actor, 'SETTLEMENT_REQUEST'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.issueByOwner(actor, { email: email() }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await service.updateEmployee(owner.actor, context.membershipId, {
      permissions: ['PARCEL_VIEW', 'FINANCE_VIEW'],
    });
    await expect(service.resolve(actor, 'FINANCE_VIEW')).resolves.toMatchObject(
      { owner: false },
    );
    await expect(
      service.resolve(actor, 'SETTLEMENT_REQUEST'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await service.updateEmployee(owner.actor, context.membershipId, {
      active: false,
    });
    await expect(service.resolve(actor, 'PARCEL_VIEW')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const ownerContext = await service.resolve(owner.actor);
    await expect(
      service.updateEmployee(owner.actor, ownerContext.membershipId, {
        active: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const audit = await service.activity(owner.actor);
    expect(
      audit.items.some(
        (event) =>
          event.action === 'EMPLOYEE_UPDATED' &&
          event.actorId === owner.user.id,
      ),
    ).toBe(true);
  });

  it('enforces tenant-matching merchant membership foreign keys in PostgreSQL', async () => {
    await expect(
      prisma.db.orm.public.MerchantMembership.create({
        userId: admin.sub,
        companyId,
        merchantId: foreignMerchantId,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        permissions: [],
      }),
    ).rejects.toMatchObject({ sqlState: '23503' });
  });
});
