import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class AuthorizationContextRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string) {
    return this.prisma.User.where({ id: userId })
      .select('id', 'isActive', 'isEmailVerified')
      .include('companyMemberships', (membership) =>
        membership
          .select('id', 'userId', 'companyId', 'status', 'principalType')
          .include('company', (company) => company.select('id', 'suspended')),
      )
      .include('platformAdminGrant', (grant) =>
        grant.select('id', 'userId', 'status', 'revokedAt', 'revokedById'),
      )
      .first();
  }
}

export type AuthorizationState = NonNullable<
  Awaited<ReturnType<AuthorizationContextRepository['findByUserId']>>
>;
