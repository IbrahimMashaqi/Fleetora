import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Temporal } from 'temporal-polyfill';
import { PrismaService } from '../prisma/prisma.service.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { lockedFleetWrite } from '../vehicles/vehicles.repository.js';
import { STAFF_ROLES, isStaffRole, type StaffRole } from './staff.types.js';

type StaffTransaction = Parameters<
  Parameters<PrismaService['db']['transaction']>[0]
>[0];

const INVITATION_FIELDS = [
  'id',
  'email',
  'role',
  'expiresAt',
  'createdAt',
  'acceptedAt',
  'revokedAt',
] as const;

// ILIKE is case insensitive; escape its wildcard syntax for an exact email match.
const emailPattern = (email: string) => email.replace(/[\\%_]/g, '\\$&');

function isConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = 'code' in error ? String(error.code) : '';
  const sqlState = 'sqlState' in error ? String(error.sqlState) : '';
  return ['23505', '40001', '40P01', 'P2002'].some(
    (value) => value === code || value === sqlState,
  );
}

async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof HttpException) throw error;
    if (isConflict(error))
      throw new ConflictException('Staff access changed; retry the operation');
    throw new InternalServerErrorException(
      'Staff access operation could not be completed',
      { cause: error },
    );
  }
}

export type AcceptedInvitation = {
  companyId: string;
  role: StaffRole;
  email: string;
};

@Injectable()
export class StaffRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  members(companyId: string) {
    return this.prisma.User.where({ companyId })
      .where((u) => u.role.in([...STAFF_ROLES]))
      .select('id', 'fullName', 'email', 'role', 'isActive')
      .orderBy((u) => u.createdAt.asc())
      .limit(500)
      .all();
  }

  invitations(companyId: string) {
    return this.prisma.db.orm.public.StaffInvitation.where({ companyId })
      .select(...INVITATION_FIELDS)
      .orderBy((i) => i.createdAt.desc())
      .limit(200)
      .all();
  }

  findOne(companyId: string, id: string) {
    return this.prisma.db.orm.public.StaffInvitation.where({ id, companyId })
      .select(...INVITATION_FIELDS)
      .first();
  }

  findByTokenHash(tokenHash: string) {
    return this.prisma.db.orm.public.StaffInvitation.where({ tokenHash })
      .select('id', 'companyId')
      .first();
  }

  private emailTaken(tx: StaffTransaction, email: string) {
    return tx.orm.public.User.where((u) => u.email.ilike(emailPattern(email)))
      .select('id')
      .first();
  }

  private async lockInvitation(
    tx: StaffTransaction,
    id: string,
    companyId: string,
  ) {
    await tx.execute(
      this.prisma.db.raw
        .sql`SELECT "id" FROM "staff_invitations" WHERE "id"=${id} AND "companyId"=${companyId} FOR UPDATE`
        .affectedCount()
        .build(),
    );
  }

  issue(
    actor: TokenPayload,
    input: {
      email: string;
      role: StaffRole;
      tokenHash: string;
      expiresAt: Temporal.Instant;
    },
  ) {
    return guarded(() =>
      lockedFleetWrite(this.prisma, actor, async (tx, companyId) => {
        // Invitations only create new identities; an address already in use
        // (in any company or role) cannot be pulled into this company.
        if (await this.emailTaken(tx, input.email))
          throw new ConflictException('An account already uses this email');
        const created = await tx.orm.public.StaffInvitation.create({
          companyId,
          email: input.email,
          role: input.role,
          tokenHash: input.tokenHash,
          issuedById: actor.sub,
          expiresAt: input.expiresAt,
        });
        return { companyId, id: created.id };
      }),
    );
  }

  // Returns false when the invitation does not exist in the actor's company.
  revoke(actor: TokenPayload, id: string) {
    return guarded(() =>
      lockedFleetWrite(this.prisma, actor, async (tx, companyId) => {
        await this.lockInvitation(tx, id, companyId);
        const invitation = await tx.orm.public.StaffInvitation.where({
          id,
          companyId,
        })
          .select('id', 'acceptedAt', 'revokedAt')
          .first();
        if (!invitation) return false;
        if (invitation.acceptedAt)
          throw new ConflictException('Invitation already accepted');
        if (!invitation.revokedAt)
          await tx.orm.public.StaffInvitation.where({ id, companyId }).update({
            revokedAt: Temporal.Now.instant(),
            revokedById: actor.sub,
          });
        return true;
      }),
    );
  }

  // Returns null when the member is not a staff user of the actor's company.
  // The company row lock taken by lockedFleetWrite serializes every staff
  // status change, so the active-administrator count cannot race.
  setActive(actor: TokenPayload, memberId: string, active: boolean) {
    return guarded(() =>
      lockedFleetWrite(this.prisma, actor, async (tx, companyId) => {
        await tx.execute(
          this.prisma.db.raw
            .sql`SELECT "id" FROM "users" WHERE "id"=${memberId} AND "companyId"=${companyId} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        const member = await tx.orm.public.User.where({
          id: memberId,
          companyId,
        })
          .select('id', 'fullName', 'email', 'role', 'isActive')
          .first();
        if (!member || !isStaffRole(member.role)) return null;
        if (!active) {
          if (member.id === actor.sub)
            throw new ConflictException('You cannot deactivate your own account');
          if (member.role === 'COMPANY_ADMIN' && member.isActive) {
            const others = await tx.orm.public.User.where({
              companyId,
              role: 'COMPANY_ADMIN',
              isActive: true,
            })
              .where((u) => u.id.neq(member.id))
              .select('id')
              .first();
            if (!others)
              throw new ConflictException(
                'A company must keep at least one active administrator',
              );
          }
        }
        if (member.isActive !== active)
          await tx.orm.public.User.where({ id: memberId, companyId }).update(
            // Deactivation also revokes the refresh session; reactivation
            // requires a fresh sign-in.
            active ? { isActive: true } : { isActive: false, refreshToken: null },
          );
        return { ...member, isActive: active };
      }),
    );
  }

  // Returns null when the token is not a usable invitation for an active company.
  accept(
    invitationId: string,
    companyId: string,
    tokenHash: string,
    account: { fullName: string; passwordHash: string },
  ): Promise<AcceptedInvitation | null> {
    return guarded(() =>
      this.prisma.db.transaction(async (tx) => {
        await tx.execute(
          this.prisma.db.raw
            .sql`SELECT "id" FROM "companies" WHERE "id"=${companyId} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        const company = await tx.orm.public.Company.where({ id: companyId })
          .select('id', 'suspended')
          .first();
        if (!company || company.suspended) return null;
        await this.lockInvitation(tx, invitationId, companyId);
        const invitation = await tx.orm.public.StaffInvitation.where({
          id: invitationId,
          companyId,
          tokenHash,
        }).first();
        if (
          !invitation ||
          invitation.acceptedAt ||
          invitation.revokedAt ||
          Temporal.Instant.compare(
            invitation.expiresAt,
            Temporal.Now.instant(),
          ) <= 0
        )
          return null;
        const role = invitation.role;
        if (!isStaffRole(role)) return null;
        if (await this.emailTaken(tx, invitation.email))
          throw new ConflictException('An account already uses this email');
        const user = await tx.orm.public.User.create({
          email: invitation.email,
          fullName: account.fullName,
          password: account.passwordHash,
          role,
          companyId,
          isActive: true,
          isEmailVerified: true,
        });
        await tx.orm.public.StaffInvitation.where({
          id: invitationId,
          companyId,
        }).update({
          acceptedAt: Temporal.Now.instant(),
          acceptedById: user.id,
        });
        return { companyId, role, email: invitation.email };
      }),
    );
  }
}
