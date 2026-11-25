import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Temporal } from 'temporal-polyfill';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { fleetCompany } from '../vehicles/vehicles.repository.js';
import { canonicalEmail } from '../../common/utils/email.js';
import type {
  AcceptStaffInvitationDto,
  StaffInvitationDto,
} from './staff.dto.js';
import { StaffRepository } from './staff.repository.js';
import {
  isStaffRole,
  type StaffInvitation,
  type StaffInvitationRow,
  type StaffOverview,
} from './staff.types.js';

const INVALID_INVITATION = 'Invalid or expired invitation';
export const hashStaffToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

function publicInvitation(row: StaffInvitationRow): StaffInvitation {
  if (!isStaffRole(row.role))
    throw new InternalServerErrorException('Invalid staff invitation role');
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    state: row.acceptedAt
      ? 'ACCEPTED'
      : row.revokedAt
        ? 'REVOKED'
        : Temporal.Instant.compare(row.expiresAt, Temporal.Now.instant()) <= 0
          ? 'EXPIRED'
          : 'PENDING',
    expiresAt: row.expiresAt.toString(),
    createdAt: row.createdAt.toString(),
    acceptedAt: row.acceptedAt?.toString() ?? null,
    revokedAt: row.revokedAt?.toString() ?? null,
  };
}

@Injectable()
export class StaffService {
  private readonly saltRounds: number;
  constructor(
    @Inject(StaffRepository) private readonly repository: StaffRepository,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.saltRounds = Number(config.get<string | number>('SALT_ROUNDS') ?? 10);
    if (
      !Number.isInteger(this.saltRounds) ||
      this.saltRounds < 4 ||
      this.saltRounds > 31
    )
      throw new Error('Invalid SALT_ROUNDS');
  }

  async overview(actor: TokenPayload): Promise<StaffOverview> {
    const companyId = fleetCompany(actor);
    const [members, invitations] = await Promise.all([
      this.repository.members(companyId),
      this.repository.invitations(companyId),
    ]);
    return {
      companyId,
      members: members.flatMap((member) =>
        isStaffRole(member.role)
          ? [
              {
                id: member.id,
                fullName: member.fullName,
                email: member.email,
                role: member.role,
                active: member.isActive,
              },
            ]
          : [],
      ),
      invitations: invitations.map(publicInvitation),
    };
  }

  async issue(actor: TokenPayload, input: StaffInvitationDto) {
    fleetCompany(actor);
    const hours = input.expiresInHours ?? 48;
    if (!Number.isInteger(hours) || hours < 1 || hours > 168)
      throw new BadRequestException('Invitation expiry must be 1 to 168 hours');
    const token = randomBytes(32).toString('hex');
    const { companyId, id } = await this.repository.issue(actor, {
      email: canonicalEmail(input.email),
      role: input.role,
      tokenHash: hashStaffToken(token),
      expiresAt: Temporal.Now.instant().add({ hours }),
    });
    const row = await this.repository.findOne(companyId, id);
    if (!row) throw new NotFoundException('Invitation not found');
    return {
      companyId,
      invitation: publicInvitation(row),
      token,
      delivery: 'MANUAL' as const,
    };
  }

  async revoke(actor: TokenPayload, id: string) {
    const companyId = fleetCompany(actor);
    if (!(await this.repository.revoke(actor, id)))
      throw new NotFoundException('Invitation not found');
    return { companyId, revoked: true as const };
  }

  async setActive(actor: TokenPayload, memberId: string, active: boolean) {
    const companyId = fleetCompany(actor);
    const member = await this.repository.setActive(actor, memberId, active);
    if (!member || !isStaffRole(member.role))
      throw new NotFoundException('Team member not found');
    return {
      companyId,
      member: {
        id: member.id,
        fullName: member.fullName,
        email: member.email,
        role: member.role,
        active: member.isActive,
      },
    };
  }

  async accept(input: AcceptStaffInvitationDto) {
    if (!/^[a-f0-9]{64}$/.test(input.token))
      throw new BadRequestException(INVALID_INVITATION);
    const tokenHash = hashStaffToken(input.token);
    const initial = await this.repository.findByTokenHash(tokenHash);
    if (!initial) throw new BadRequestException(INVALID_INVITATION);
    const fullName = input.name.trim();
    if (fullName.length < 2)
      throw new BadRequestException('Name must be at least 2 characters');
    // Hash before taking row locks; the repository rechecks the locked invitation.
    const passwordHash = await bcrypt.hash(input.password, this.saltRounds);
    const accepted = await this.repository.accept(
      initial.id,
      initial.companyId,
      tokenHash,
      { fullName, passwordHash },
    );
    if (!accepted) throw new BadRequestException(INVALID_INVITATION);
    return { accepted: true as const, email: accepted.email, role: accepted.role };
  }
}
