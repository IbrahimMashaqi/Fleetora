import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Temporal } from 'temporal-polyfill';
import {
  MerchantAccessRepository,
  type MerchantOrm,
  type MerchantTransaction,
} from './merchant-access.repository.js';
import {
  MERCHANT_PERMISSIONS,
  permissions,
  requirePermission,
  type MerchantContext,
  type MerchantIdentity,
  type MerchantPermission,
} from './merchant-access.types.js';
import { canonicalEmail } from '../../common/utils/email.js';
import { MailService } from '../mail/mail.service.js';
import type {
  AcceptMerchantInvitationDto,
  CompanyMerchantInvitationDto,
  MerchantInvitationDto,
  PreviewMerchantInvitationDto,
  UpdateMerchantEmployeeDto,
} from './merchant-access.dto.js';
import { merchantAgreementTerms } from './merchant-agreement.js';

type InvitationRow = NonNullable<
  Awaited<ReturnType<MerchantOrm['MerchantInvitation']['first']>>
>;
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
// ILIKE is case insensitive; escape its wildcard syntax for an exact email match.
const emailPattern = (email: string) => email.replace(/[\\%_]/g, '\\$&');
const publicInvitation = (row: InvitationRow) => ({
  id: row.id,
  companyId: row.companyId,
  merchantId: row.merchantId,
  email: row.email,
  role: row.role,
  permissions: permissions(row.permissions),
  expiresAt: row.expiresAt,
  acceptedAt: row.acceptedAt,
  revokedAt: row.revokedAt,
  createdAt: row.createdAt,
  state: row.acceptedAt
    ? 'ACCEPTED'
    : row.revokedAt
      ? 'REVOKED'
      : Temporal.Instant.compare(row.expiresAt, Temporal.Now.instant()) <= 0
        ? 'EXPIRED'
        : 'PENDING',
});

@Injectable()
export class MerchantAccessService {
  private readonly saltRounds: number;
  private readonly logger = new Logger(MerchantAccessService.name);
  constructor(
    @Inject(MerchantAccessRepository)
    private readonly repository: MerchantAccessRepository,
    @Inject(ConfigService) config: ConfigService,
    @Inject(MailService) private readonly mail: MailService,
  ) {
    this.saltRounds = Number(config.get<string | number>('SALT_ROUNDS') ?? 10);
    if (
      !Number.isInteger(this.saltRounds) ||
      this.saltRounds < 4 ||
      this.saltRounds > 31
    )
      throw new Error('Invalid SALT_ROUNDS');
  }

  async resolve(
    actor: MerchantIdentity,
    permission?: MerchantPermission,
    tx?: MerchantTransaction,
  ): Promise<MerchantContext> {
    if (tx) {
      await this.repository.lockUser(tx, actor.sub);
      await this.repository.lockMembership(tx, actor.sub);
    }
    const orm = tx?.orm.public ?? this.repository.orm;
    const user = await orm.User.where({ id: actor.sub }).first();
    if (!user?.isActive || !user.isEmailVerified)
      throw new UnauthorizedException();
    if (user.role !== 'MERCHANT' || !user.companyId)
      throw new ForbiddenException('Active merchant membership required');
    const membership = await orm.MerchantMembership.where({
      userId: user.id,
      companyId: user.companyId,
      status: 'ACTIVE',
    }).first();
    if (!membership)
      throw new ForbiddenException('Active merchant membership required');
    if (tx)
      await this.repository.lockMerchant(
        tx,
        membership.merchantId,
        membership.companyId,
      );
    const [company, merchant] = await Promise.all([
      orm.Company.where({ id: membership.companyId }).first(),
      orm.Merchant.where({
        id: membership.merchantId,
        companyId: membership.companyId,
      }).first(),
    ]);
    // OD-13: a merchant operates only once ACTIVE (agreement accepted or legacy).
    if (
      !company ||
      company.suspended ||
      !merchant?.active ||
      merchant.activationStatus !== 'ACTIVE'
    )
      throw new ForbiddenException('Merchant or company is inactive');
    const owner = membership.role === 'OWNER';
    return requirePermission(
      {
        userId: user.id,
        companyId: membership.companyId,
        merchantId: membership.merchantId,
        membershipId: membership.id,
        owner,
        permissions: owner
          ? [...MERCHANT_PERMISSIONS]
          : permissions(membership.permissions),
      },
      permission,
    );
  }

  async me(actor: MerchantIdentity) {
    const context = await this.resolve(actor);
    const [merchant, company] = await Promise.all([
      this.repository.orm.Merchant.where({
        id: context.merchantId,
        companyId: context.companyId,
      })
        .select(
          'id',
          'name',
          'contactName',
          'phone',
          'pickupAddress',
          'city',
          'latitude',
          'longitude',
        )
        .first(),
      this.repository.orm.Company.where({ id: context.companyId })
        .select('id', 'name')
        .first(),
    ]);
    return { ...context, merchant, company };
  }

  private async owner(actor: MerchantIdentity, tx?: MerchantTransaction) {
    const context = await this.resolve(actor, undefined, tx);
    if (!context.owner)
      throw new ForbiddenException('Merchant owner access required');
    return context;
  }

  private async admin(actor: MerchantIdentity, tx?: MerchantTransaction) {
    if (tx) await this.repository.lockUser(tx, actor.sub);
    const orm = tx?.orm.public ?? this.repository.orm;
    const user = await orm.User.where({ id: actor.sub }).first();
    if (!user?.isActive || !user.isEmailVerified)
      throw new UnauthorizedException();
    if (user.role !== 'COMPANY_ADMIN' || !user.companyId)
      throw new ForbiddenException('Company administrator access required');
    const company = await orm.Company.where({ id: user.companyId }).first();
    if (!company || company.suspended)
      throw new ForbiddenException('Company is inactive');
    return { userId: user.id, companyId: user.companyId };
  }

  async issueByAdmin(
    actor: MerchantIdentity,
    merchantId: string,
    input: CompanyMerchantInvitationDto,
  ) {
    const initial = await this.admin(actor);
    const { invitation, merchantName } = await this.repository.transaction(
      initial.companyId,
      async (tx) => {
        const admin = await this.admin(actor, tx);
        if (admin.companyId !== initial.companyId)
          throw new ForbiddenException('Company context changed');
        return this.issue(
          tx,
          admin.userId,
          admin.companyId,
          merchantId,
          input.role,
          input,
        );
      },
    );
    return { ...invitation, delivery: await this.deliver(invitation, merchantName) };
  }

  // Runs after the invitation is committed; a mail failure never undoes it.
  // The link and code are the merchant app's existing activation contract.
  private async deliver(
    invitation: ReturnType<typeof publicInvitation> & { token: string },
    merchantName: string,
  ): Promise<'EMAIL' | 'MANUAL'> {
    try {
      await this.mail.sendInvitationEmail({
        to: invitation.email,
        url: `fleetora-merchant://app/activate?token=${invitation.token}`,
        code: invitation.token,
        inviter: merchantName,
        role: invitation.role === 'OWNER' ? 'OWNER' : 'EMPLOYEE',
        expiresAt: invitation.expiresAt.toString(),
      });
      return 'EMAIL';
    } catch (error: unknown) {
      this.logger.warn({
        event: 'merchant_invitation.email_failed',
        invitationId: invitation.id,
        error: error instanceof Error ? error.name : 'unknown',
      });
      return 'MANUAL';
    }
  }

  async issueByOwner(actor: MerchantIdentity, input: MerchantInvitationDto) {
    const initial = await this.owner(actor);
    return this.repository.transaction(initial.companyId, async (tx) => {
      const owner = await this.owner(actor, tx);
      if (
        owner.companyId !== initial.companyId ||
        owner.merchantId !== initial.merchantId
      )
        throw new ForbiddenException('Merchant context changed');
      const { invitation } = await this.issue(
        tx,
        owner.userId,
        owner.companyId,
        owner.merchantId,
        'EMPLOYEE',
        input,
      );
      // The merchant app hands the code over itself; no email is sent here.
      return { ...invitation, delivery: 'MANUAL' as const };
    });
  }

  private async issue(
    tx: MerchantTransaction,
    actorId: string,
    companyId: string,
    merchantId: string,
    role: 'OWNER' | 'EMPLOYEE',
    input: MerchantInvitationDto,
  ) {
    await this.repository.lockMerchant(tx, merchantId, companyId);
    const merchant = await tx.orm.public.Merchant.where({
      id: merchantId,
      companyId,
      active: true,
    }).first();
    if (!merchant) throw new NotFoundException('Merchant not found');
    if (
      role === 'OWNER' &&
      (await tx.orm.public.MerchantMembership.where({
        companyId,
        merchantId,
        role: 'OWNER',
        status: 'ACTIVE',
      }).first())
    )
      throw new ConflictException('Merchant already has an owner');
    const email = canonicalEmail(input.email);
    const grant = permissions(input.permissions ?? []);
    const expiresInHours = input.expiresInHours ?? 48;
    if (
      !Number.isInteger(expiresInHours) ||
      expiresInHours < 1 ||
      expiresInHours > 168
    )
      throw new BadRequestException('Invitation expiry must be 1 to 168 hours');
    const token = randomBytes(32).toString('hex');
    const invitation = await tx.orm.public.MerchantInvitation.create({
      companyId,
      merchantId,
      email,
      role,
      permissions: grant,
      tokenHash: hashToken(token),
      issuedById: actorId,
      expiresAt: Temporal.Now.instant().add({ hours: expiresInHours }),
    });
    await this.repository.audit(
      tx,
      companyId,
      merchantId,
      actorId,
      'INVITATION_ISSUED',
      { invitationId: invitation.id, role, email, permissions: grant },
    );
    return {
      invitation: { ...publicInvitation(invitation), token },
      merchantName: merchant.name,
    };
  }

  async invitations(actor: MerchantIdentity, merchantId?: string) {
    const context = merchantId
      ? await this.admin(actor)
      : await this.owner(actor);
    const scopedMerchantId =
      merchantId ?? ('merchantId' in context ? context.merchantId : undefined);
    if (!scopedMerchantId) throw new ForbiddenException();
    if (!(await this.repository.orm.Merchant.where({ id: scopedMerchantId, companyId: context.companyId }).first()))
      throw new NotFoundException('Merchant not found');
    return {
      companyId: context.companyId,
      merchantId: scopedMerchantId,
      items: (
        await this.repository.orm.MerchantInvitation.where({
          companyId: context.companyId,
          merchantId: scopedMerchantId,
        })
          .orderBy((i) => i.createdAt.desc())
          .limit(200)
          .all()
      ).map(publicInvitation),
    };
  }

  async activity(actor: MerchantIdentity) {
    const context = await this.owner(actor);
    return {
      items: await this.repository.orm.MerchantAccessEvent.where({
        companyId: context.companyId,
        merchantId: context.merchantId,
      })
        .select('id', 'actorId', 'action', 'details', 'createdAt')
        .orderBy((event) => event.createdAt.desc())
        .limit(200)
        .all(),
    };
  }

  async revoke(actor: MerchantIdentity, id: string, merchantId?: string) {
    const initial = merchantId
      ? await this.admin(actor)
      : await this.owner(actor);
    return this.repository.transaction(initial.companyId, async (tx) => {
      const current = merchantId
        ? await this.admin(actor, tx)
        : await this.owner(actor, tx);
      const scopedMerchantId =
        merchantId ??
        ('merchantId' in current ? current.merchantId : undefined);
      if (current.companyId !== initial.companyId || !scopedMerchantId)
        throw new ForbiddenException();
      await this.repository.lockInvitation(tx, id, current.companyId);
      const invite = await tx.orm.public.MerchantInvitation.where({
        id,
        companyId: current.companyId,
        merchantId: scopedMerchantId,
      }).first();
      if (!invite) throw new NotFoundException('Invitation not found');
      if (invite.acceptedAt)
        throw new ConflictException('Invitation already accepted');
      if (!invite.revokedAt) {
        await tx.orm.public.MerchantInvitation.where({
          id,
          companyId: current.companyId,
          merchantId: scopedMerchantId,
        }).update({ revokedAt: Temporal.Now.instant() });
        await this.repository.audit(
          tx,
          current.companyId,
          scopedMerchantId,
          current.userId,
          'INVITATION_REVOKED',
          { invitationId: id },
        );
      }
      return {
        revoked: true,
        companyId: current.companyId,
        merchantId: scopedMerchantId,
      };
    });
  }

  /**
   * OD-13: shows the invitee what accepting means. For the OWNER of a PENDING merchant this
   * is the agreement (terms snapshot) and the revision that must be echoed on acceptance.
   */
  async previewInvitation(input: PreviewMerchantInvitationDto) {
    const tokenHash = hashToken(input.token);
    const invite = await this.repository.orm.MerchantInvitation.where({
      tokenHash,
    }).first();
    if (
      !invite ||
      invite.acceptedAt ||
      invite.revokedAt ||
      Temporal.Instant.compare(invite.expiresAt, Temporal.Now.instant()) <= 0
    )
      throw new BadRequestException('Invalid or expired invitation');
    return this.repository.transaction(invite.companyId, async (tx) => {
      const [company, merchant] = await Promise.all([
        tx.orm.public.Company.where({ id: invite.companyId })
          .select('name')
          .first(),
        tx.orm.public.Merchant.where({
          id: invite.merchantId,
          companyId: invite.companyId,
          active: true,
        })
          .select('name', 'activationStatus')
          .first(),
      ]);
      if (!company || !merchant)
        throw new BadRequestException('Invalid or expired invitation');
      const requiresAgreement =
        invite.role === 'OWNER' && merchant.activationStatus === 'PENDING';
      return {
        email: invite.email,
        role: invite.role,
        companyName: company.name,
        merchantName: merchant.name,
        activationStatus: merchant.activationStatus,
        requiresAgreement,
        agreement: requiresAgreement
          ? await merchantAgreementTerms(tx, invite.merchantId, invite.companyId)
          : null,
      };
    });
  }

  async accept(input: AcceptMerchantInvitationDto) {
    if (!/^[a-f0-9]{64}$/.test(input.token))
      throw new BadRequestException('Invalid or expired invitation');
    const tokenHash = hashToken(input.token);
    const initial = await this.repository.orm.MerchantInvitation.where({
      tokenHash,
    }).first();
    if (!initial)
      throw new BadRequestException('Invalid or expired invitation');
    // Password work happens before row locks; the credential is rechecked against the locked row.
    const existing = await this.repository.orm.User.where((u) =>
      u.email.ilike(emailPattern(initial.email)),
    ).first();
    if (existing && !(await bcrypt.compare(input.password, existing.password)))
      throw new UnauthorizedException('Unable to accept invitation');
    if (
      !existing &&
      (!input.name?.trim() ||
        input.name.trim().length < 2 ||
        input.password.length < 6 ||
        !/[A-Z]/.test(input.password) ||
        Buffer.byteLength(input.password, 'utf8') > 72)
    )
      throw new BadRequestException(
        'Name and a valid password are required to activate an account',
      );
    const passwordHash = existing
      ? undefined
      : await bcrypt.hash(input.password, this.saltRounds);
    return this.repository.transaction(initial.companyId, async (tx) => {
      if (existing) await this.repository.lockUser(tx, existing.id);
      await this.repository.lockMerchant(
        tx,
        initial.merchantId,
        initial.companyId,
      );
      await this.repository.lockInvitation(tx, initial.id, initial.companyId);
      const invite = await tx.orm.public.MerchantInvitation.where({
        id: initial.id,
        tokenHash,
        companyId: initial.companyId,
        merchantId: initial.merchantId,
      }).first();
      if (
        !invite ||
        invite.acceptedAt ||
        invite.revokedAt ||
        Temporal.Instant.compare(invite.expiresAt, Temporal.Now.instant()) <= 0
      )
        throw new BadRequestException('Invalid or expired invitation');
      const merchant = await tx.orm.public.Merchant.where({
        id: invite.merchantId,
        companyId: invite.companyId,
        active: true,
      }).first();
      if (!merchant)
        throw new BadRequestException('Invalid or expired invitation');
      if (
        invite.role === 'OWNER' &&
        (await tx.orm.public.MerchantMembership.where({
          companyId: invite.companyId,
          merchantId: invite.merchantId,
          role: 'OWNER',
          status: 'ACTIVE',
        }).first())
      )
        throw new ConflictException('Merchant already has an owner');
      let user = existing
        ? await tx.orm.public.User.where({ id: existing.id }).first()
        : null;
      if (
        existing &&
        (!user ||
          user.password !== existing.password ||
          canonicalEmail(user.email ?? '') !== invite.email ||
          !user.isActive ||
          user.role !== 'MERCHANT' ||
          (user.companyId !== null && user.companyId !== invite.companyId))
      )
        throw new ForbiddenException('Account cannot join this merchant');
      if (
        user &&
        (await tx.orm.public.MerchantMembership.where({
          userId: user.id,
        }).first())
      )
        throw new ConflictException(
          'Account already has a merchant affiliation',
        );
      // OD-13 (BR-002, BR-093): the OWNER of a PENDING merchant activates it only by
      // accepting the agreement, i.e. the terms snapshot of the revision it was shown.
      const activates =
        invite.role === 'OWNER' && merchant.activationStatus === 'PENDING';
      if (activates && input.acceptAgreement !== true)
        throw new BadRequestException(
          'Accept the merchant agreement to activate this merchant',
        );
      if (activates && input.agreementRevision !== merchant.revision)
        throw new ConflictException(
          'The merchant agreement changed; review it again before accepting',
        );
      // A token can create a new identity; it never resets an existing identity's password.
      if (!user) {
        if (!passwordHash || !input.name)
          throw new ConflictException('Account changed; retry acceptance');
        if (
          await tx.orm.public.User.where((u) =>
            u.email.ilike(emailPattern(invite.email)),
          ).first()
        )
          throw new ConflictException(
            'Account already exists; retry with its current password',
          );
        user = await tx.orm.public.User.create({
          email: invite.email,
          fullName: input.name.trim(),
          password: passwordHash,
          role: 'MERCHANT',
          companyId: invite.companyId,
          isActive: true,
          isEmailVerified: true,
        });
      } else {
        await tx.orm.public.User.where({ id: user.id }).update({
          companyId: invite.companyId,
          isEmailVerified: true,
          verificationToken: null,
          verificationTokenExpiresAt: null,
          refreshToken: null,
        });
      }
      const granted = permissions(invite.permissions);
      await tx.orm.public.MerchantMembership.create({
        userId: user.id,
        merchantId: invite.merchantId,
        companyId: invite.companyId,
        role: invite.role,
        status: 'ACTIVE',
        permissions: granted,
      });
      await tx.orm.public.MerchantInvitation.where({
        id: invite.id,
        companyId: invite.companyId,
      }).update({ acceptedAt: Temporal.Now.instant(), acceptedById: user.id });
      if (activates) {
        const terms = await merchantAgreementTerms(
          tx,
          invite.merchantId,
          invite.companyId,
        );
        const activated = await tx.orm.public.Merchant.where({
          id: invite.merchantId,
          companyId: invite.companyId,
          revision: merchant.revision,
          activationStatus: 'PENDING',
        }).update({
          activationStatus: 'ACTIVE',
          agreementAcceptedAt: Temporal.Now.instant(),
          agreementAcceptedById: user.id,
          agreementTerms: terms,
          revision: merchant.revision + 1,
        });
        if (!activated)
          throw new ConflictException(
            'The merchant agreement changed; review it again before accepting',
          );
        await this.repository.audit(
          tx,
          invite.companyId,
          invite.merchantId,
          user.id,
          'AGREEMENT_ACCEPTED',
          {
            invitationId: invite.id,
            agreementRevision: String(merchant.revision),
          },
        );
      }
      await this.repository.audit(
        tx,
        invite.companyId,
        invite.merchantId,
        user.id,
        'INVITATION_ACCEPTED',
        { invitationId: invite.id, role: invite.role, permissions: granted },
      );
      return {
        accepted: true,
        email: user.email ?? invite.email,
        merchantId: invite.merchantId,
        companyId: invite.companyId,
      };
    });
  }

  async employees(actor: MerchantIdentity) {
    const context = await this.owner(actor);
    const rows = await this.repository.orm.MerchantMembership.where({
      companyId: context.companyId,
      merchantId: context.merchantId,
    })
      .include('user', (u) => u.select('fullName', 'email'))
      .limit(500)
      .all();
    return {
      items: rows.map((row) => {
        if (!row.user)
          throw new NotFoundException('Membership identity not found');
        return {
          id: row.id,
          userId: row.userId,
          role: row.role,
          status: row.status,
          permissions:
            row.role === 'OWNER'
              ? [...MERCHANT_PERMISSIONS]
              : permissions(row.permissions),
          fullName: row.user.fullName,
          email: row.user.email,
        };
      }),
    };
  }

  async updateEmployee(
    actor: MerchantIdentity,
    id: string,
    input: UpdateMerchantEmployeeDto,
  ) {
    const initial = await this.owner(actor);
    return this.repository.transaction(initial.companyId, async (tx) => {
      const owner = await this.owner(actor, tx);
      if (
        owner.companyId !== initial.companyId ||
        owner.merchantId !== initial.merchantId
      )
        throw new ForbiddenException();
      const membership = await tx.orm.public.MerchantMembership.where({
        id,
        companyId: owner.companyId,
        merchantId: owner.merchantId,
      }).first();
      if (!membership) throw new NotFoundException('Employee not found');
      if (membership.role !== 'EMPLOYEE')
        throw new ForbiddenException('Owner membership cannot be changed here');
      const granted =
        input.permissions === undefined
          ? permissions(membership.permissions)
          : permissions(input.permissions);
      const status =
        input.active === undefined
          ? membership.status
          : input.active
            ? 'ACTIVE'
            : 'REVOKED';
      await tx.orm.public.MerchantMembership.where({
        id,
        companyId: owner.companyId,
        merchantId: owner.merchantId,
      }).update({ permissions: granted, status });
      await this.repository.audit(
        tx,
        owner.companyId,
        owner.merchantId,
        owner.userId,
        'EMPLOYEE_UPDATED',
        {
          membershipId: id,
          oldStatus: membership.status,
          status,
          oldPermissions: permissions(membership.permissions),
          permissions: granted,
        },
      );
      return { id, status, permissions: granted };
    });
  }
}
