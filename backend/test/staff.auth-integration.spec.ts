import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { StaffRepository } from '../src/modules/staff/staff.repository.js';
import { StaffService } from '../src/modules/staff/staff.service.js';
import type { StaffRole } from '../src/modules/staff/staff.types.js';
import type { TokenPayload } from '../src/modules/auth/token/token.payload.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';

const companyId = 'a1111111-1111-4111-8111-111111111111';
const otherCompanyId = 'a2222222-2222-4222-8222-222222222222';
const adminId = 'a3333333-3333-4333-8333-333333333333';
const otherAdminId = 'a4444444-4444-4444-8444-444444444444';
const actor: TokenPayload = {
  sub: adminId,
  orgId: companyId,
  role: 'COMPANY_ADMIN',
  email: 'staff-admin@example.invalid',
};
const otherActor: TokenPayload = {
  sub: otherAdminId,
  orgId: otherCompanyId,
  role: 'COMPANY_ADMIN',
  email: 'staff-other-admin@example.invalid',
};
const password = 'Invited1';

describe('staff invitations against disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  let prisma: PrismaService;
  let service: StaffService;

  async function cleanup() {
    guard.assertVerified();
    for (const id of [companyId, otherCompanyId]) {
      await prisma.db.orm.public.StaffInvitation.where({
        companyId: id,
      }).deleteAll();
      await prisma.User.where({ companyId: id }).deleteAll();
      await prisma.Company.where({ id }).delete();
    }
    await prisma.User.where((u) =>
      u.email.ilike('%@staff-invite.example.invalid'),
    ).deleteAll();
  }
  const issue = (email: string, role: StaffRole = 'ACCOUNTANT', by = actor) =>
    service.issue(by, { email, role });
  const accept = (token: string, name = 'Invited Person') =>
    service.accept({ token, name, password });
  const userByEmail = (email: string) =>
    prisma.User.where((u) => u.email.ilike(email))
      .select('id', 'role', 'companyId', 'isActive', 'isEmailVerified', 'password')
      .first();

  beforeAll(async () => {
    prisma = new PrismaService();
    service = new StaffService(
      new StaffRepository(prisma),
      new ConfigService({ SALT_ROUNDS: 4 }),
    );
    await guard.verify(() => readAuthPostgresIdentity(prisma));
  });

  beforeEach(async () => {
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    await cleanup();
    for (const id of [companyId, otherCompanyId])
      await prisma.Company.create({
        id,
        name: 'Fictional staff test',
        plan: 'TRIAL',
        suspended: false,
      });
    for (const admin of [actor, otherActor])
      await prisma.User.create({
        id: admin.sub,
        companyId: admin.orgId,
        role: 'COMPANY_ADMIN',
        fullName: 'Fictional Administrator',
        email: admin.email,
        password: await bcrypt.hash(randomBytes(32).toString('hex'), 4),
        isActive: true,
        isEmailVerified: true,
      });
  });

  afterAll(async () => {
    await guard.teardown(
      async () => {
        await guard.verify(() => readAuthPostgresIdentity(prisma));
        await cleanup();
      },
      async () => {
        await prisma?.db.close();
      },
    );
  });

  it('creates a verified accountant in the issuing company from a single-use token', async () => {
    const email = 'Accountant@Staff-Invite.Example.Invalid';
    const issued = await issue(email);
    expect(issued.companyId).toBe(companyId);
    expect(issued.invitation).toMatchObject({
      email: email.toLowerCase(),
      role: 'ACCOUNTANT',
      state: 'PENDING',
    });
    const stored = await prisma.db.orm.public.StaffInvitation.where({
      id: issued.invitation.id,
    }).first();
    expect(stored?.tokenHash).not.toBe(issued.token);
    expect(stored?.issuedById).toBe(adminId);

    expect(await accept(issued.token)).toEqual({
      accepted: true,
      email: email.toLowerCase(),
      role: 'ACCOUNTANT',
    });
    const user = await userByEmail(email);
    expect(user).toMatchObject({
      role: 'ACCOUNTANT',
      companyId,
      isActive: true,
      isEmailVerified: true,
    });
    expect(await bcrypt.compare(password, user?.password ?? '')).toBe(true);

    await expect(accept(issued.token)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const overview = await service.overview(actor);
    expect(overview.invitations[0]).toMatchObject({ state: 'ACCEPTED' });
    expect(overview.members.map((m) => m.role).sort()).toEqual([
      'ACCOUNTANT',
      'COMPANY_ADMIN',
    ]);
  });

  it('lets an invited second administrator manage staff of the same company only', async () => {
    const issued = await issue('second@staff-invite.example.invalid', 'COMPANY_ADMIN');
    await accept(issued.token);
    const second = await userByEmail('second@staff-invite.example.invalid');
    expect(second).toMatchObject({ role: 'COMPANY_ADMIN', companyId });
    const secondActor: TokenPayload = {
      sub: second?.id ?? '',
      orgId: companyId,
      role: 'COMPANY_ADMIN',
      email: 'second@staff-invite.example.invalid',
    };
    const next = await issue('third@staff-invite.example.invalid', 'ACCOUNTANT', secondActor);
    expect(next.companyId).toBe(companyId);
  });

  it('isolates invitations between companies', async () => {
    const issued = await issue('isolated@staff-invite.example.invalid');
    const foreign = await service.overview(otherActor);
    expect(foreign.invitations).toEqual([]);
    expect(foreign.members.map((m) => m.id)).toEqual([otherAdminId]);
    await expect(
      service.revoke(otherActor, issued.invitation.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    // A forged token payload claiming the other company fails the persisted identity check.
    await expect(
      service.revoke({ ...actor, orgId: otherCompanyId }, issued.invitation.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      (await service.overview(actor)).invitations[0],
    ).toMatchObject({ state: 'PENDING' });
  });

  it('refuses revoked and expired invitations and keeps revocation idempotent', async () => {
    const revoked = await issue('revoked@staff-invite.example.invalid');
    expect(await service.revoke(actor, revoked.invitation.id)).toEqual({
      companyId,
      revoked: true,
    });
    await service.revoke(actor, revoked.invitation.id);
    const row = await prisma.db.orm.public.StaffInvitation.where({
      id: revoked.invitation.id,
    }).first();
    expect(row?.revokedById).toBe(adminId);
    await expect(accept(revoked.token)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const expired = await issue('expired@staff-invite.example.invalid');
    await prisma.db.orm.public.StaffInvitation.where({
      id: expired.invitation.id,
    }).update({ expiresAt: Temporal.Now.instant().subtract({ minutes: 1 }) });
    await expect(accept(expired.token)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await userByEmail('revoked@staff-invite.example.invalid')).toBeNull();
    expect(await userByEmail('expired@staff-invite.example.invalid')).toBeNull();
  });

  it('cannot revoke an accepted invitation', async () => {
    const issued = await issue('accepted@staff-invite.example.invalid');
    await accept(issued.token);
    await expect(
      service.revoke(actor, issued.invitation.id),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('never attaches an existing account, at issue or at acceptance', async () => {
    await expect(issue(otherActor.email.toUpperCase())).rejects.toBeInstanceOf(
      ConflictException,
    );
    const issued = await issue('late@staff-invite.example.invalid');
    await prisma.User.create({
      fullName: 'Signed up meanwhile',
      email: 'LATE@staff-invite.example.invalid',
      password: await bcrypt.hash(randomBytes(16).toString('hex'), 4),
      role: 'COMPANY_ADMIN',
      companyId: otherCompanyId,
      isActive: true,
      isEmailVerified: false,
    });
    await expect(accept(issued.token)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await userByEmail('late@staff-invite.example.invalid')).toMatchObject({
      companyId: otherCompanyId,
    });
    expect((await service.overview(actor)).invitations[0].state).toBe('PENDING');
  });

  it('refuses acceptance for a suspended company and issuance by an inactive admin', async () => {
    const issued = await issue('suspended@staff-invite.example.invalid');
    await prisma.Company.where({ id: companyId }).update({ suspended: true });
    await expect(accept(issued.token)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await prisma.Company.where({ id: companyId }).update({ suspended: false });
    await prisma.User.where({ id: adminId }).update({ isActive: false });
    await expect(
      issue('inactive@staff-invite.example.invalid'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a token exactly once under concurrent attempts', async () => {
    const issued = await issue('race@staff-invite.example.invalid');
    const results = await Promise.allSettled([
      accept(issued.token, 'Racer One'),
      accept(issued.token, 'Racer Two'),
      accept(issued.token, 'Racer Three'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.User.where((u) =>
        u.email.ilike('race@staff-invite.example.invalid'),
      ).all(),
    ).toHaveLength(1);
  });

  it('rejects non-staff roles and inconsistent states at the database', async () => {
    const base = {
      companyId,
      email: 'db@staff-invite.example.invalid',
      issuedById: adminId,
      expiresAt: Temporal.Now.instant().add({ hours: 1 }),
    };
    await expect(
      prisma.db.orm.public.StaffInvitation.create({
        ...base,
        role: 'PLATFORM_ADMIN',
        tokenHash: randomBytes(32).toString('hex'),
      }),
    ).rejects.toThrow();
    await expect(
      prisma.db.orm.public.StaffInvitation.create({
        ...base,
        role: 'ACCOUNTANT',
        tokenHash: randomBytes(32).toString('hex'),
        revokedAt: Temporal.Now.instant(),
      }),
    ).rejects.toThrow();
  });
});
