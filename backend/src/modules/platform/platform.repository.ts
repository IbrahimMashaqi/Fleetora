import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Temporal } from 'temporal-polyfill';
import { PrismaService } from '../prisma/prisma.service.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import {
  platformRole,
  platformPermissions,
  type PlatformRole,
} from './platform-policy.js';
import type { PlatformMemberDto } from './platform.dto.js';
type Transaction = Parameters<
  Parameters<PrismaService['db']['transaction']>[0]
>[0];
const BOOTSTRAP = 'first-super-admin';

@Injectable()
export class PlatformRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private async write<T>(
    operation: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.db.transaction(async (tx) => {
        await this.serialize(tx);
        return operation(tx);
      });
    } catch (error: unknown) {
      // Company signup can reserve the email while an invitation is being accepted.
      // The transaction rolls back the new identity/grant together on that race.
      if (
        typeof error === 'object' &&
        error !== null &&
        (('sqlState' in error && error.sqlState === '23505') ||
          ('code' in error &&
            (error.code === '23505' || error.code === 'P2002')))
      )
        throw new ConflictException('An account already uses this email');
      throw error;
    }
  }
  private async serialize(tx: Transaction) {
    // All platform identity writes share one lock, including CLI and public acceptance.
    await tx.execute(
      this.prisma.db.raw.sql`SELECT pg_advisory_xact_lock(73421, 15)`
        .affectedCount()
        .build(),
    );
  }
  private async lockedUser(tx: Transaction, id: string) {
    await tx.execute(
      this.prisma.db.raw
        .sql`SELECT "id" FROM "users" WHERE "id"=${id} FOR UPDATE`
        .affectedCount()
        .build(),
    );
  }
  async identity(actor: TokenPayload, tx?: Transaction) {
    if (actor.role !== 'PLATFORM_ADMIN' || actor.orgId)
      throw new ForbiddenException('Platform identity required');
    const orm = tx?.orm.public ?? this.prisma.db.orm.public;
    const user = await orm.User.where({ id: actor.sub }).first();
    const staff = await orm.PlatformStaff.where({ userId: actor.sub }).first();
    const grant = await orm.PlatformAdminGrant.where({
      userId: actor.sub,
    }).first();
    if (!user || !user.isActive || !user.isEmailVerified)
      throw new UnauthorizedException();
    if ((actor.sessionVersion ?? 0) !== user.authVersion)
      throw new UnauthorizedException('Session revoked');
    if (
      user.role !== 'PLATFORM_ADMIN' ||
      user.companyId !== null ||
      !staff ||
      !platformRole(staff.role) ||
      !grant ||
      grant.status !== 'ACTIVE' ||
      grant.revokedAt ||
      grant.revokedById ||
      (await orm.CompanyMembership.where({
        userId: actor.sub,
        status: 'ACTIVE',
      }).first())
    )
      throw new ForbiddenException('Platform access is not provisioned');
    return {
      userId: user.id,
      name: user.fullName,
      email: user.email,
      role: staff.role,
      permissions: platformPermissions(staff.role),
    };
  }
  private async administrator(actor: TokenPayload, tx?: Transaction) {
    const identity = await this.identity(actor, tx);
    if (identity.role !== 'SUPER_ADMIN')
      throw new ForbiddenException('Super Admin permission required');
    return identity;
  }
  private async audit(
    tx: Transaction,
    actorId: string | null,
    subjectId: string,
    action: string,
    details: Record<string, string | boolean | null>,
  ) {
    await tx.orm.public.PlatformAccessEvent.create({
      actorId,
      subjectId,
      action,
      details,
    });
  }
  async overview(actor: TokenPayload) {
    await this.administrator(actor);
    const rows = await this.prisma.db.orm.public.PlatformStaff.orderBy((s) =>
      s.createdAt.asc(),
    )
      .include('user')
      .all();
    const invitations =
      await this.prisma.db.orm.public.PlatformInvitation.orderBy((i) =>
        i.createdAt.desc(),
      )
        .limit(50)
        .all();
    return {
      members: rows
        .filter(
          (s) => s.user.role === 'PLATFORM_ADMIN' && s.user.companyId === null,
        )
        .map((s) => ({
          id: s.user.id,
          name: s.user.fullName,
          email: s.user.email,
          role: s.role,
          active: s.user.isActive,
        })),
      invitations: invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt.toString(),
        state: i.acceptedAt
          ? 'ACCEPTED'
          : i.revokedAt
            ? 'REVOKED'
            : Temporal.Instant.compare(i.expiresAt, Temporal.Now.instant()) <= 0
              ? 'EXPIRED'
              : 'PENDING',
      })),
    };
  }
  async auditEvents(actor: TokenPayload) {
    await this.administrator(actor);
    return {
      items: (
        await this.prisma.db.orm.public.PlatformAccessEvent.orderBy((e) =>
          e.createdAt.desc(),
        )
          .limit(50)
          .all()
      ).map((e) => ({
        id: e.id,
        actorId: e.actorId,
        subjectId: e.subjectId,
        action: e.action,
        details: e.details,
        createdAt: e.createdAt.toString(),
      })),
    };
  }
  private async emailTaken(tx: Transaction, email: string) {
    return tx.orm.public.User.where((u) =>
      u.email.ilike(email.replace(/[\\%_]/g, '\\$&')),
    ).first();
  }
  async invite(
    actor: TokenPayload | null,
    input: {
      email: string;
      role: PlatformRole;
      tokenHash: string;
      expiresAt: Temporal.Instant;
    },
  ) {
    return this.write(async (tx) => {
      if (actor) {
        await this.lockedUser(tx, actor.sub);
        await this.administrator(actor, tx);
      }
      const bootstrap = actor === null;
      const existing = bootstrap
        ? await tx.orm.public.PlatformInvitation.where({
            bootstrapKey: BOOTSTRAP,
          }).first()
        : null;
      if (
        bootstrap &&
        ((await tx.orm.public.PlatformStaff.where({
          role: 'SUPER_ADMIN',
        }).first()) ||
          existing?.acceptedAt ||
          (existing && existing.email !== input.email))
      )
        throw new ConflictException(
          'Platform bootstrap is already established',
        );
      if (await this.emailTaken(tx, input.email))
        throw new ConflictException('An account already uses this email');
      const pending = await tx.orm.public.PlatformInvitation.where({
        email: input.email,
        acceptedAt: null,
        revokedAt: null,
      }).all();
      for (const invitation of pending) {
        if (invitation.id !== existing?.id)
          await tx.orm.public.PlatformInvitation.where({
            id: invitation.id,
          }).update({ revokedAt: Temporal.Now.instant() });
      }
      const invitation = existing
        ? await tx.orm.public.PlatformInvitation.where({
            id: existing.id,
          }).update({
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
            revokedAt: null,
          })
        : await tx.orm.public.PlatformInvitation.create({
            ...input,
            bootstrapKey: bootstrap ? BOOTSTRAP : null,
            issuedById: actor?.sub ?? null,
          });
      if (!invitation) throw new ConflictException('Invitation changed');
      await this.audit(
        tx,
        actor?.sub ?? null,
        invitation.id,
        bootstrap ? 'PLATFORM_BOOTSTRAP_ISSUED' : 'PLATFORM_INVITATION_ISSUED',
        { role: input.role },
      );
      return invitation;
    });
  }
  async accept(tokenHash: string, name: string, password: string) {
    return this.write(async (tx) => {
      const invitation = await tx.orm.public.PlatformInvitation.where({
        tokenHash,
      }).first();
      if (!invitation || invitation.acceptedAt || invitation.revokedAt)
        throw new BadRequestException('Invitation invalid, used or revoked');
      if (
        Temporal.Instant.compare(
          invitation.expiresAt,
          Temporal.Now.instant(),
        ) <= 0
      )
        throw new BadRequestException('Invitation expired');
      if (invitation.issuedById) {
        const issuer = await tx.orm.public.User.where({
          id: invitation.issuedById,
        }).first();
        await this.administrator(
          {
            sub: invitation.issuedById,
            role: 'PLATFORM_ADMIN',
            orgId: '',
            email: '',
            sessionVersion: issuer?.authVersion,
          },
          tx,
        );
      } else if (
        invitation.bootstrapKey !== BOOTSTRAP ||
        (await tx.orm.public.PlatformStaff.where({
          role: 'SUPER_ADMIN',
        }).first())
      )
        throw new BadRequestException('Invitation invalid, used or revoked');
      if (await this.emailTaken(tx, invitation.email))
        throw new ConflictException('An account already uses this email');
      const user = await tx.orm.public.User.create({
        email: invitation.email,
        fullName: name,
        password,
        role: 'PLATFORM_ADMIN',
        companyId: null,
        isActive: true,
        isEmailVerified: true,
      });
      await tx.orm.public.PlatformStaff.create({
        userId: user.id,
        role: invitation.role,
      });
      await tx.orm.public.PlatformAdminGrant.create({
        userId: user.id,
        status: 'ACTIVE',
        grantedById: invitation.issuedById,
      });
      await tx.orm.public.PlatformInvitation.where({
        id: invitation.id,
      }).update({ acceptedAt: Temporal.Now.instant(), acceptedById: user.id });
      await this.audit(tx, user.id, user.id, 'PLATFORM_INVITATION_ACCEPTED', {
        role: invitation.role,
      });
      return { accepted: true, email: user.email };
    });
  }
  async revoke(actor: TokenPayload, id: string) {
    return this.write(async (tx) => {
      await this.lockedUser(tx, actor.sub);
      await this.administrator(actor, tx);
      const invitation = await tx.orm.public.PlatformInvitation.where({
        id,
      }).first();
      if (!invitation) throw new NotFoundException('Invitation not found');
      if (invitation.acceptedAt)
        throw new ConflictException('Invitation already accepted');
      if (!invitation.revokedAt) {
        await tx.orm.public.PlatformInvitation.where({ id }).update({
          revokedAt: Temporal.Now.instant(),
        });
        await this.audit(tx, actor.sub, id, 'PLATFORM_INVITATION_REVOKED', {});
      }
      return { revoked: true };
    });
  }
  async update(actor: TokenPayload, id: string, input: PlatformMemberDto) {
    return this.write(async (tx) => {
      await this.lockedUser(tx, actor.sub);
      await this.administrator(actor, tx);
      await this.lockedUser(tx, id);
      const staff = await tx.orm.public.PlatformStaff.where({
        userId: id,
      }).first();
      const user = await tx.orm.public.User.where({
        id,
        role: 'PLATFORM_ADMIN',
        companyId: null,
      }).first();
      if (!staff || !user)
        throw new NotFoundException('Platform staff member not found');
      const role = input.role ?? staff.role,
        active = input.active ?? user.isActive;
      if (
        staff.role === 'SUPER_ADMIN' &&
        user.isActive &&
        (role !== 'SUPER_ADMIN' || !active)
      ) {
        const remaining = await tx.orm.public.PlatformStaff.where({
          role: 'SUPER_ADMIN',
        })
          .include('user')
          .all();
        let another = false;
        for (const candidate of remaining) {
          if (
            candidate.userId === id ||
            !candidate.user.isActive ||
            !candidate.user.isEmailVerified ||
            candidate.user.role !== 'PLATFORM_ADMIN' ||
            candidate.user.companyId !== null
          )
            continue;
          const grant = await tx.orm.public.PlatformAdminGrant.where({
            userId: candidate.userId,
            status: 'ACTIVE',
            revokedAt: null,
            revokedById: null,
          }).first();
          const membership = await tx.orm.public.CompanyMembership.where({
            userId: candidate.userId,
            status: 'ACTIVE',
          }).first();
          if (grant && !membership) {
            another = true;
            break;
          }
        }
        if (!another)
          throw new ConflictException('Keep at least one active Super Admin');
      }
      if (role !== staff.role || active !== user.isActive) {
        await tx.orm.public.PlatformStaff.where({ userId: id }).update({
          role,
        });
        await tx.orm.public.User.where({ id }).update({
          isActive: active,
          refreshToken: null,
          authVersion: user.authVersion + 1,
        });
        await tx.orm.public.PlatformAdminGrant.where({ userId: id }).update({
          status: active ? 'ACTIVE' : 'REVOKED',
          revokedAt: active ? null : Temporal.Now.instant(),
          revokedById: active ? null : actor.sub,
        });
        await this.audit(tx, actor.sub, id, 'PLATFORM_STAFF_CHANGED', {
          previousRole: staff.role,
          role,
          active,
        });
      }
      return { updated: true };
    });
  }
}
