import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Temporal } from 'temporal-polyfill';
import { PrismaService } from '../prisma/prisma.service.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { company } from '../parcels/parcel-domain.js';
import { lockedFleetWrite } from '../vehicles/vehicles.repository.js';
import type { FleetTransaction } from '../fleet/fleet.repository.js';
import { normalizeDriverPhone } from './driver-phone.js';

export type DriverCredential = NonNullable<
  Awaited<ReturnType<DriverIdentityRepository['credential']>>
>;
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof HttpException) throw error;
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : '';
    const state =
      typeof error === 'object' && error !== null && 'sqlState' in error
        ? String(error.sqlState)
        : '';
    if (
      [code, state].some((value) =>
        ['23505', 'P2002', '40001', '40P01'].includes(value),
      )
    )
      throw new ConflictException('Driver identity changed; retry');
    // ORM errors may contain credential bind values. Do not attach them to an
    // HTTP exception or let the default unhandled-error logger serialize them.
    throw new InternalServerErrorException(
      'Driver identity operation could not be completed',
    );
  }
}
@Injectable()
export class DriverIdentityRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async lockWorker(
    tx: FleetTransaction,
    workerId: string,
    companyId: string,
  ) {
    await tx.execute(
      this.prisma.db.raw
        .sql`SELECT id FROM workers WHERE id=${workerId} AND "companyId"=${companyId} FOR UPDATE`
        .affectedCount()
        .build(),
    );
    const worker = await tx.orm.public.Worker.where({
      id: workerId,
      companyId,
    }).first();
    if (!worker) throw new NotFoundException('Driver not found');
    return worker;
  }
  private write<T>(
    actor: TokenPayload,
    workerId: string,
    operation: (
      tx: FleetTransaction,
      companyId: string,
      worker: Awaited<ReturnType<DriverIdentityRepository['lockWorker']>>,
    ) => Promise<T>,
  ) {
    return guarded(() =>
      lockedFleetWrite(
        this.prisma,
        actor,
        async (tx, companyId) =>
          operation(
            tx,
            companyId,
            await this.lockWorker(tx, workerId, companyId),
          ),
        'manageDrivers',
      ),
    );
  }
  private async audit(
    tx: FleetTransaction,
    companyId: string,
    workerId: string,
    actorId: string,
    action: string,
    details: Record<string, string | boolean> = {},
  ) {
    await tx.orm.public.DriverAccessEvent.create({
      companyId,
      workerId,
      actorId,
      action,
      details,
    });
  }
  private async revokePending(
    tx: FleetTransaction,
    companyId: string,
    workerId: string,
  ) {
    await tx.orm.public.DriverInvitation.where({ companyId, workerId })
      .where((i) => i.acceptedAt.isNull())
      .where((i) => i.revokedAt.isNull())
      .update({ revokedAt: Temporal.Now.instant() });
  }
  private async revokeIdentity(
    tx: FleetTransaction,
    companyId: string,
    workerId: string,
  ) {
    const account = await tx.orm.public.DriverAccount.where({
      companyId,
      workerId,
    }).first();
    if (account) {
      await tx.execute(
        this.prisma.db.raw
          .sql`SELECT id FROM users WHERE id=${account.userId} AND "companyId"=${companyId} FOR UPDATE`
          .affectedCount()
          .build(),
      );
      const user = await tx.orm.public.User.where({
        id: account.userId,
        companyId,
        role: 'DRIVER',
      }).first();
      if (!user) throw new ConflictException('Driver identity changed');
      await tx.orm.public.User.where({ id: user.id, companyId }).update({
        isActive: false,
        refreshToken: null,
        authVersion: user.authVersion + 1,
      });
    }
    await this.revokePending(tx, companyId, workerId);
  }
  async overview(actor: TokenPayload, workerId: string) {
    const companyId = company(actor, 'manageDrivers');
    const worker = await this.prisma.Worker.where({ id: workerId, companyId })
      .select('id', 'phone', 'offboardedAt')
      .first();
    if (!worker) throw new NotFoundException('Driver not found');
    const account = await this.prisma.db.orm.public.DriverAccount.where({
      companyId,
      workerId,
    })
      .include('user', (u) =>
        u.where({ companyId, role: 'DRIVER' }).select('isActive'),
      )
      .first();
    const pending = await this.prisma.db.orm.public.DriverInvitation.where({
      companyId,
      workerId,
    })
      .where((i) => i.acceptedAt.isNull())
      .where((i) => i.revokedAt.isNull())
      .where((i) => i.expiresAt.gt(Temporal.Now.instant()))
      .select('id', 'expiresAt')
      .first();
    let invitationBlockedReason: 'PHONE_IN_USE' | 'INVALID_PHONE' | null = null;
    let invitationPhone: string | undefined;
    try {
      invitationPhone = normalizeDriverPhone(worker.phone);
    } catch (error: unknown) {
      if (!(error instanceof BadRequestException)) throw error;
      invitationBlockedReason = 'INVALID_PHONE';
    }
    if (invitationPhone) {
      // Phone uniqueness is global. Return only the collision, never the other
      // account's identity or company, and never infer a Worker/account link.
      const owner = await this.prisma.db.orm.public.DriverAccount.where({
        phone: invitationPhone,
      })
        .select('workerId', 'companyId')
        .first();
      if (
        owner &&
        (owner.workerId !== workerId || owner.companyId !== companyId)
      )
        invitationBlockedReason = 'PHONE_IN_USE';
    }
    return {
      companyId,
      workerId,
      phone: account?.phone ?? worker.phone,
      linked: !!account,
      accessActive: !!account?.user?.isActive,
      offboarded: !!worker.offboardedAt,
      invitationBlockedReason,
      pendingInvitation: pending
        ? { id: pending.id, expiresAt: pending.expiresAt.toString() }
        : null,
    };
  }
  issue(
    actor: TokenPayload,
    workerId: string,
    tokenHash: string,
    expiresAt: Temporal.Instant,
  ) {
    return this.write(actor, workerId, async (tx, companyId, worker) => {
      const phone = normalizeDriverPhone(worker.phone);
      const existing = await tx.orm.public.DriverAccount.where({ phone })
        .select('workerId', 'companyId')
        .first();
      if (
        existing &&
        (existing.workerId !== workerId || existing.companyId !== companyId)
      )
        throw new ConflictException('This phone already has a driver account');
      await this.revokePending(tx, companyId, workerId);
      const invitation = await tx.orm.public.DriverInvitation.create({
        companyId,
        workerId,
        phone,
        tokenHash,
        expiresAt,
        issuedById: actor.sub,
      });
      await this.audit(
        tx,
        companyId,
        workerId,
        actor.sub,
        'DRIVER_INVITATION_ISSUED',
      );
      return {
        companyId,
        workerId,
        phone,
        invitationId: invitation.id,
        expiresAt: invitation.expiresAt.toString(),
      };
    });
  }
  revokeInvitation(actor: TokenPayload, workerId: string) {
    return this.write(actor, workerId, async (tx, companyId) => {
      const latest = await tx.orm.public.DriverInvitation.where({
        companyId,
        workerId,
      })
        .orderBy((i) => i.createdAt.desc())
        .first();
      if (latest?.acceptedAt)
        throw new ConflictException(
          'Invitation already accepted; revoke driver access instead',
        );
      await this.revokePending(tx, companyId, workerId);
      await this.audit(
        tx,
        companyId,
        workerId,
        actor.sub,
        'DRIVER_INVITATION_REVOKED',
      );
      return { companyId, revoked: true };
    });
  }
  revokeAccess(actor: TokenPayload, workerId: string) {
    return this.write(actor, workerId, async (tx, companyId) => {
      await this.revokeIdentity(tx, companyId, workerId);
      await this.audit(
        tx,
        companyId,
        workerId,
        actor.sub,
        'DRIVER_ACCESS_REVOKED',
      );
      return { companyId, revoked: true };
    });
  }
  offboard(actor: TokenPayload, workerId: string, revokeAccess: boolean) {
    return this.write(actor, workerId, async (tx, companyId, worker) => {
      if (!worker.offboardedAt)
        await tx.orm.public.Worker.where({ id: workerId, companyId }).update({
          offboardedAt: Temporal.Now.instant(),
        });
      await this.revokePending(tx, companyId, workerId);
      if (revokeAccess) await this.revokeIdentity(tx, companyId, workerId);
      await this.audit(
        tx,
        companyId,
        workerId,
        actor.sub,
        'DRIVER_OFFBOARDED',
        { revokeAccess },
      );
      return { companyId, offboarded: true, accessRevoked: revokeAccess };
    });
  }
  async accept(tokenHash: string, passwordHash: string) {
    const initial = await this.prisma.db.orm.public.DriverInvitation.where({
      tokenHash,
    })
      .select('id', 'companyId', 'workerId')
      .first();
    if (!initial) return false;
    try {
      return await this.prisma.db.transaction(async (tx) => {
        const { companyId, workerId } = initial;
        await tx.execute(
          this.prisma.db.raw
            .sql`SELECT id FROM companies WHERE id=${companyId} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        const tenant = await tx.orm.public.Company.where({
          id: companyId,
        }).first();
        if (!tenant || tenant.suspended) return false;
        const worker = await this.lockWorker(tx, workerId, companyId);
        await tx.execute(
          this.prisma.db.raw
            .sql`SELECT id FROM driver_invitations WHERE id=${initial.id} AND "companyId"=${companyId} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        const invitation = await tx.orm.public.DriverInvitation.where({
          id: initial.id,
          companyId,
          workerId,
          tokenHash,
        }).first();
        if (
          !invitation ||
          invitation.acceptedAt ||
          invitation.revokedAt ||
          Temporal.Instant.compare(
            invitation.expiresAt,
            Temporal.Now.instant(),
          ) <= 0 ||
          normalizeDriverPhone(worker.phone) !== invitation.phone
        )
          return false;
        const collision = await tx.orm.public.DriverAccount.where({
          phone: invitation.phone,
        }).first();
        if (
          collision &&
          (collision.workerId !== workerId || collision.companyId !== companyId)
        )
          throw new ConflictException(
            'This phone already has a driver account',
          );
        const existing = await tx.orm.public.DriverAccount.where({
          workerId,
          companyId,
        }).first();
        let userId: string;
        if (existing) {
          await tx.execute(
            this.prisma.db.raw
              .sql`SELECT id FROM users WHERE id=${existing.userId} AND "companyId"=${companyId} FOR UPDATE`
              .affectedCount()
              .build(),
          );
          const user = await tx.orm.public.User.where({
            id: existing.userId,
            companyId,
            role: 'DRIVER',
          }).first();
          if (!user) throw new ConflictException('Driver identity changed');
          userId = user.id;
          await tx.orm.public.User.where({ id: userId, companyId }).update({
            password: passwordHash,
            isActive: true,
            isEmailVerified: true,
            refreshToken: null,
            authVersion: user.authVersion + 1,
          });
          await tx.orm.public.DriverAccount.where({
            id: existing.id,
            companyId,
          }).update({ phone: invitation.phone });
        } else {
          const user = await tx.orm.public.User.create({
            companyId,
            role: 'DRIVER',
            fullName: worker.fullName,
            password: passwordHash,
            isEmailVerified: true,
            isActive: true,
          });
          userId = user.id;
          await tx.orm.public.DriverAccount.create({
            companyId,
            workerId,
            userId,
            phone: invitation.phone,
          });
        }
        await tx.orm.public.DriverInvitation.where({
          id: invitation.id,
          companyId,
        }).update({ acceptedAt: Temporal.Now.instant() });
        await this.audit(
          tx,
          companyId,
          workerId,
          userId,
          'DRIVER_INVITATION_ACCEPTED',
        );
        return true;
      });
    } catch (error: unknown) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : '';
      const state =
        typeof error === 'object' && error !== null && 'sqlState' in error
          ? String(error.sqlState)
          : '';
      if (
        [code, state].some((value) =>
          ['23505', 'P2002', '40001', '40P01'].includes(value),
        )
      )
        throw new ConflictException('Driver identity changed; retry');
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Driver activation could not be completed',
      );
    }
  }
  credential(phone: string) {
    return this.prisma.db.orm.public.DriverAccount.where({ phone })
      .include('user', (u) =>
        u.select(
          'id',
          'companyId',
          'role',
          'password',
          'authVersion',
          'isActive',
          'isEmailVerified',
        ),
      )
      .first();
  }
  async session<T>(
    credential: DriverCredential,
    issue: (
      userId: string,
      companyId: string,
      workerId: string,
      version: number,
    ) => Promise<{ result: T; refreshVerifier: string }>,
  ): Promise<T> {
    return guarded(() =>
      this.prisma.db.transaction(async (tx) => {
        const { companyId } = credential;
        await tx.execute(
          this.prisma.db.raw
            .sql`SELECT id FROM companies WHERE id=${companyId} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        await tx.execute(
          this.prisma.db.raw
            .sql`SELECT id FROM users WHERE id=${credential.userId} AND "companyId"=${companyId} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        const tenant = await tx.orm.public.Company.where({
          id: companyId,
        }).first();
        const account = await tx.orm.public.DriverAccount.where({
          id: credential.id,
          companyId,
          phone: credential.phone,
        }).first();
        const user = await tx.orm.public.User.where({
          id: credential.userId,
          companyId,
          role: 'DRIVER',
        }).first();
        if (
          !tenant ||
          tenant.suspended ||
          !account ||
          !user?.isActive ||
          !user.isEmailVerified ||
          user.password !== credential.user?.password ||
          user.authVersion !== credential.user?.authVersion
        )
          throw new UnauthorizedException('Invalid credentials');
        const issued = await issue(
          user.id,
          companyId,
          account.workerId,
          user.authVersion,
        );
        await tx.orm.public.User.where({ id: user.id, companyId }).update({
          refreshToken: issued.refreshVerifier,
        });
        return issued.result;
      }),
    );
  }
  async me(actor: TokenPayload) {
    if (actor.role !== 'DRIVER' || !actor.orgId)
      throw new UnauthorizedException();
    const account = await this.prisma.db.orm.public.DriverAccount.where({
      userId: actor.sub,
      companyId: actor.orgId,
    })
      .include('worker', (w) =>
        w
          .where({ companyId: actor.orgId })
          .select('fullName', 'status', 'offboardedAt'),
      )
      .first();
    if (!account?.worker) throw new UnauthorizedException();
    return {
      id: actor.sub,
      role: 'DRIVER' as const,
      workerId: account.workerId,
      companyId: account.companyId,
      phone: account.phone,
      name: account.worker.fullName,
      suspended: account.worker.status === 'SUSPENDED',
      offboarded: !!account.worker.offboardedAt,
    };
  }
}
