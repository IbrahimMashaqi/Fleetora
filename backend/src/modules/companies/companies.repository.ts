import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Temporal } from 'temporal-polyfill';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlatformRepository } from '../platform/platform.repository.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import {
  companyOperable,
  companyPermissions,
  companyTransition,
} from './company-policy.js';
import { normalizeLookupSearch } from '../parcels/lookup-search.js';
import type {
  CompanyPageDto,
  CompanyProfileDto,
  CompanyTransitionDto,
  CreateCompanyDto,
} from './companies.dto.js';
type Transaction = Parameters<
  Parameters<PrismaService['db']['transaction']>[0]
>[0];
type Company = NonNullable<
  Awaited<ReturnType<PrismaService['Company']['first']>>
>;
type InvitationInput = { tokenHash: string; expiresAt: Temporal.Instant };
function profile(company: Company) {
  return {
    id: company.id,
    name: company.name,
    phone: company.phone,
    address: company.address,
    approvalStatus: company.approvalStatus,
    suspended: company.suspended,
    status: company.suspended ? 'SUSPENDED' : company.approvalStatus,
    rejectionReason: company.rejectionReason,
    currency: company.currency,
    plan: company.plan,
    revision: company.revision,
    createdAt: company.createdAt.toString(),
    updatedAt: company.updatedAt.toString(),
  };
}
@Injectable()
export class CompaniesRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PlatformRepository) private readonly platform: PlatformRepository,
  ) {}
  async authorize(actor: TokenPayload, write = false, tx?: Transaction) {
    const identity = await this.platform.identity(actor, tx);
    const permission = companyPermissions(identity.role);
    if (!(write ? permission.write : permission.read))
      throw new ForbiddenException('Company platform permission required');
    return identity;
  }
  private async transaction<T>(operation: (tx: Transaction) => Promise<T>) {
    try {
      return await this.prisma.db.transaction(operation);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (('sqlState' in error && error.sqlState === '23505') ||
          ('code' in error && ['P2002', '23505'].includes(String(error.code))))
      )
        throw new ConflictException('An account already uses this email');
      throw error;
    }
  }
  private async lockUser(tx: Transaction, id: string) {
    await tx.execute(
      this.prisma.db.raw.sql`SELECT id FROM users WHERE id=${id} FOR UPDATE`
        .affectedCount()
        .build(),
    );
  }
  private async lockCompany(tx: Transaction, id: string) {
    await tx.execute(
      this.prisma.db.raw.sql`SELECT id FROM companies WHERE id=${id} FOR UPDATE`
        .affectedCount()
        .build(),
    );
    const company = await tx.orm.public.Company.where({ id }).first();
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }
  private async owner(
    actor: TokenPayload,
    company: Company,
    tx?: Transaction,
    write = false,
  ) {
    const orm = tx?.orm.public ?? this.prisma.db.orm.public;
    const user = await orm.User.where({ id: actor.sub }).first();
    if (
      !user?.isActive ||
      !user.isEmailVerified ||
      company.suspended ||
      company.accessVersion !== (actor.companyVersion ?? 0)
    )
      throw new UnauthorizedException();
    if (
      user.companyId !== company.id ||
      actor.orgId !== company.id ||
      user.role === 'PLATFORM_ADMIN' ||
      user.role !== actor.role ||
      (write && user.role !== 'COMPANY_ADMIN')
    )
      throw new ForbiddenException('Company administrator permission required');
  }
  private async audit(
    tx: Transaction,
    actorId: string,
    companyId: string,
    action: string,
    details: Record<string, string | number | boolean | null>,
  ) {
    await tx.orm.public.CompanyAccessEvent.create({
      companyId,
      actorId,
      action,
      details,
    });
  }
  async list(actor: TokenPayload, query: CompanyPageDto) {
    await this.authorize(actor);
    const term = normalizeLookupSearch(query.search ?? ''),
      status = query.status ?? '';
    const ids = await this.prisma.db.runtime().query(
      this.prisma.db.raw.sql`
      SELECT c.id FROM companies c
      WHERE (${status}='' OR (CASE WHEN c.suspended THEN 'SUSPENDED' ELSE c."approvalStatus" END)=${status})
      AND strpos(lower(translate(regexp_replace(c.name || ' ' || coalesce(c.phone,''), '[ؐ-ًؚ-ٰٟۖ-ۭـ]', '', 'g'), 'أإآةى', 'اااهي')), ${term})>0
      ORDER BY c."createdAt" DESC,c.id LIMIT ${query.pageSize + 1} OFFSET ${(query.page - 1) * query.pageSize}
    `
        .returnsRow({ id: 'pg/text@1' })
        .build(),
    );
    const rows = ids.length
      ? await this.prisma.Company.where((c) =>
          c.id.in(ids.map((row) => row.id)),
        ).all()
      : [];
    const byId = new Map(rows.map((row) => [row.id, profile(row)]));
    return {
      items: ids.slice(0, query.pageSize).flatMap((row) => {
        const item = byId.get(row.id);
        return item ? [item] : [];
      }),
      page: query.page,
      pageSize: query.pageSize,
      hasNext: ids.length > query.pageSize,
    };
  }
  async details(actor: TokenPayload, id: string) {
    await this.authorize(actor);
    const company = await this.prisma.Company.where({ id }).first();
    if (!company) throw new NotFoundException('Company not found');
    const admins = await this.prisma.User.where({
      companyId: id,
      role: 'COMPANY_ADMIN',
    })
      .select('id', 'fullName', 'email', 'isActive', 'isEmailVerified')
      .orderBy((u) => u.createdAt.asc())
      .limit(20)
      .all();
    const events = await this.prisma.db.orm.public.CompanyAccessEvent.where({
      companyId: id,
    })
      .orderBy((e) => e.createdAt.desc())
      .limit(50)
      .all();
    return {
      company: profile(company),
      primaryAdminId: company.primaryAdminId,
      admins: admins.map((u) => ({
        id: u.id,
        name: u.fullName,
        email: u.email,
        active: u.isActive,
        verified: u.isEmailVerified,
      })),
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        details: e.details,
        createdAt: e.createdAt.toString(),
      })),
    };
  }
  async self(actor: TokenPayload, activeOnly = false) {
    if (!actor.orgId) throw new ForbiddenException('Company context required');
    const company = await this.prisma.Company.where({
      id: actor.orgId,
    }).first();
    if (!company) throw new UnauthorizedException();
    await this.owner(actor, company, undefined, activeOnly);
    if (activeOnly && !companyOperable(company))
      throw new ForbiddenException('Company approval required');
    return { company: profile(company) };
  }
  async save(actor: TokenPayload, input: CompanyProfileDto, resubmit: boolean) {
    if (!actor.orgId) throw new ForbiddenException('Company context required');
    return this.transaction(async (tx) => {
      const company = await this.lockCompany(tx, actor.orgId);
      await this.lockUser(tx, actor.sub);
      await this.owner(actor, company, tx, true);
      if (company.revision !== input.revision)
        throw new ConflictException(
          'Company changed. Refresh before trying again',
        );
      if (
        resubmit
          ? company.approvalStatus !== 'REJECTED'
          : !companyOperable(company)
      )
        throw new ConflictException('Company transition is not allowed');
      const updated = await tx.orm.public.Company.where({
        id: company.id,
      }).update({
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        address: input.address?.trim() || null,
        revision: company.revision + 1,
        ...(resubmit
          ? { approvalStatus: 'PENDING', rejectionReason: null }
          : {}),
      });
      if (!updated)
        throw new ConflictException(
          'Company changed. Refresh before trying again',
        );
      await this.audit(
        tx,
        actor.sub,
        company.id,
        resubmit ? 'COMPANY_RESUBMITTED' : 'COMPANY_PROFILE_CHANGED',
        { revision: updated.revision },
      );
      return { company: profile(updated) };
    });
  }
  async transition(
    actor: TokenPayload,
    id: string,
    input: CompanyTransitionDto,
  ) {
    await this.authorize(actor, true);
    return this.transaction(async (tx) => {
      const company = await this.lockCompany(tx, id);
      await this.lockUser(tx, actor.sub);
      await this.authorize(actor, true, tx);
      if (company.revision !== input.revision)
        throw new ConflictException(
          'Company changed. Refresh before trying again',
        );
      const change = companyTransition(company, input.action, input.reason);
      const revokeSessions =
        input.action === 'suspend' || input.action === 'reactivate';
      const updated = await tx.orm.public.Company.where({ id }).update({
        ...change,
        revision: company.revision + 1,
        ...(revokeSessions ? { accessVersion: company.accessVersion + 1 } : {}),
      });
      if (!updated)
        throw new ConflictException(
          'Company changed. Refresh before trying again',
        );
      if (revokeSessions)
        await tx.execute(
          this.prisma.db.raw
            .sql`UPDATE users SET "refreshToken"=NULL WHERE "companyId"=${id}`
            .affectedCount()
            .build(),
        );
      const actions = {
        approve: 'COMPANY_APPROVED',
        reject: 'COMPANY_REJECTED',
        suspend: 'COMPANY_SUSPENDED',
        reactivate: 'COMPANY_REACTIVATED',
      };
      await this.audit(tx, actor.sub, id, actions[input.action], {
        previousStatus: company.approvalStatus,
        previousSuspended: company.suspended,
        approvalStatus: updated.approvalStatus,
        suspended: updated.suspended,
        reason: input.reason?.trim() || null,
      });
      return { company: profile(updated) };
    });
  }
  async create(
    actor: TokenPayload,
    input: CreateCompanyDto,
    password: string,
    invitation: InvitationInput,
  ) {
    return this.transaction(async (tx) => {
      await this.lockUser(tx, actor.sub);
      await this.authorize(actor, true, tx);
      if (
        await tx.orm.public.User.where((u) =>
          u.email.ilike(input.adminEmail.replace(/[\\%_]/g, '\\$&')),
        ).first()
      )
        throw new ConflictException('An account already uses this email');
      const company = await tx.orm.public.Company.create({
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        address: input.address?.trim() || null,
        currency: input.currency,
        approvalStatus: 'ACTIVE',
        suspended: false,
      });
      const admin = await tx.orm.public.User.create({
        companyId: company.id,
        role: 'COMPANY_ADMIN',
        fullName: input.adminName.trim(),
        email: input.adminEmail,
        password,
        isActive: false,
        isEmailVerified: false,
      });
      await tx.orm.public.Company.where({ id: company.id }).update({
        primaryAdminId: admin.id,
      });
      const row = await tx.orm.public.CompanyAdminInvitation.create({
        companyId: company.id,
        userId: admin.id,
        issuedById: actor.sub,
        ...invitation,
      });
      await this.audit(tx, actor.sub, company.id, 'COMPANY_CREATED', {
        primaryAdminId: admin.id,
      });
      return {
        company: profile(company),
        invitationId: row.id,
        email: admin.email!,
        name: admin.fullName,
      };
    });
  }
  async reissue(actor: TokenPayload, id: string, invitation: InvitationInput) {
    await this.authorize(actor, true);
    return this.transaction(async (tx) => {
      const company = await this.lockCompany(tx, id);
      await this.lockUser(tx, actor.sub);
      await this.authorize(actor, true, tx);
      if (!companyOperable(company) || !company.primaryAdminId)
        throw new ConflictException('Company transition is not allowed');
      const user = await tx.orm.public.User.where({
        id: company.primaryAdminId,
        companyId: id,
        role: 'COMPANY_ADMIN',
        isActive: false,
        isEmailVerified: false,
      }).first();
      if (!user?.email)
        throw new ConflictException('Primary admin is already activated');
      for (const old of await tx.orm.public.CompanyAdminInvitation.where({
        companyId: id,
        acceptedAt: null,
        revokedAt: null,
      }).all())
        await tx.orm.public.CompanyAdminInvitation.where({ id: old.id }).update(
          { revokedAt: Temporal.Now.instant() },
        );
      const row = await tx.orm.public.CompanyAdminInvitation.create({
        companyId: id,
        userId: user.id,
        issuedById: actor.sub,
        ...invitation,
      });
      await this.audit(tx, actor.sub, id, 'COMPANY_ADMIN_INVITED', {});
      return {
        company: profile(company),
        invitationId: row.id,
        email: user.email,
        name: user.fullName,
      };
    });
  }
  async accept(tokenHash: string, name: string, password: string) {
    const initial =
      await this.prisma.db.orm.public.CompanyAdminInvitation.where({
        tokenHash,
      }).first();
    if (!initial)
      throw new BadRequestException('Invitation invalid, used or revoked');
    return this.transaction(async (tx) => {
      const company = await this.lockCompany(tx, initial.companyId);
      const row = await tx.orm.public.CompanyAdminInvitation.where({
        id: initial.id,
        tokenHash,
      }).first();
      if (!row || row.acceptedAt || row.revokedAt || !companyOperable(company))
        throw new BadRequestException('Invitation invalid, used or revoked');
      if (Temporal.Instant.compare(row.expiresAt, Temporal.Now.instant()) <= 0)
        throw new BadRequestException('Invitation expired');
      await this.lockUser(tx, row.issuedById);
      const issuer = await tx.orm.public.User.where({
        id: row.issuedById,
      }).first();
      await this.authorize(
        {
          sub: row.issuedById,
          role: 'PLATFORM_ADMIN',
          orgId: '',
          email: '',
          sessionVersion: issuer?.authVersion,
        },
        true,
        tx,
      );
      await this.lockUser(tx, row.userId);
      const user = await tx.orm.public.User.where({
        id: row.userId,
        companyId: company.id,
        role: 'COMPANY_ADMIN',
        isActive: false,
        isEmailVerified: false,
      }).first();
      if (!user || company.primaryAdminId !== user.id)
        throw new BadRequestException('Invitation invalid, used or revoked');
      await tx.orm.public.User.where({ id: user.id }).update({
        fullName: name,
        password,
        isActive: true,
        isEmailVerified: true,
      });
      await tx.orm.public.CompanyAdminInvitation.where({ id: row.id }).update({
        acceptedAt: Temporal.Now.instant(),
      });
      await this.audit(tx, user.id, company.id, 'COMPANY_ADMIN_ACTIVATED', {});
      return { accepted: true, email: user.email };
    });
  }
}
