import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthorizationContextRepository } from './authorization-context.repository.js';
import type { AuthorizationState } from './authorization-context.repository.js';
import type {
  CompanyActor,
  PlatformActor,
  ValidatedIdentity,
} from './authorization-context.types.js';

// Phase 7B.1 internal boundary: NOT registered in AuthModule or AppModule.
// Importing this into an HTTP flow requires approved schema deployment, backfill,
// and cutover. These contexts establish scope, not action/role permissions.
@Injectable()
export class AuthorizationContextService {
  constructor(private readonly repository: AuthorizationContextRepository) {}

  async resolvePlatform(identity: ValidatedIdentity): Promise<PlatformActor> {
    const user = await this.loadEligibleIdentity(identity);
    const grant = user.platformAdminGrant;
    if (
      !grant ||
      grant.userId !== user.id ||
      grant.status !== 'ACTIVE' ||
      grant.revokedAt !== null ||
      grant.revokedById !== null ||
      user.companyMemberships.some(
        (membership) => membership.status === 'ACTIVE',
      )
    ) {
      throw new ForbiddenException(
        'Platform authorization context is unavailable',
      );
    }
    return { kind: 'platform', userId: user.id, grantId: grant.id };
  }

  async resolveCompany(
    identity: ValidatedIdentity,
    companyId: string,
  ): Promise<CompanyActor> {
    const user = await this.loadEligibleIdentity(identity);
    const memberships = user.companyMemberships.filter(
      (membership) => membership.status === 'ACTIVE',
    );
    const membership = memberships[0];
    if (
      !companyId ||
      user.platformAdminGrant?.status === 'ACTIVE' ||
      memberships.length !== 1 ||
      !membership ||
      membership.userId !== user.id ||
      membership.companyId !== companyId ||
      !membership.company ||
      membership.company.id !== companyId ||
      membership.company.suspended
    ) {
      throw new ForbiddenException(
        'Company authorization context is unavailable',
      );
    }
    return {
      kind: 'company',
      userId: user.id,
      membershipId: membership.id,
      companyId: membership.companyId,
      principalType: membership.principalType,
    };
  }

  private async loadEligibleIdentity(
    identity: ValidatedIdentity,
  ): Promise<AuthorizationState> {
    if (!identity.sub) throw new UnauthorizedException();
    const user = await this.repository.findByUserId(identity.sub);
    if (
      !user ||
      user.id !== identity.sub ||
      !user.isActive ||
      !user.isEmailVerified
    ) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
