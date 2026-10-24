import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { dateToInstant, instantToMs } from '../../common/utils/temporal.js';
import { matchesOneTimeTokenVerifier } from './token/one-time-token.js';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByEmail(email: string) {
    return this.prisma.User.where({ email }).first();
  }

  async findUserById(userId: string) {
    return this.prisma.User.where({ id: userId }).first();
  }

  async findSessionContextById(userId: string) {
    return this.prisma.User.where({ id: userId })
      .select(
        'id',
        'fullName',
        'email',
        'role',
        'companyId',
        'isActive',
        'isEmailVerified',
      )
      .include('company', (company) =>
        company.select('id', 'name', 'suspended'),
      )
      .first();
  }

  async isCompanyActiveForUser(user: {
    role: string;
    companyId: string | null;
  }): Promise<boolean> {
    if (user.role === 'PLATFORM_ADMIN') return user.companyId === null;
    if (!user.companyId) return false;

    const company = await this.prisma.Company.where({ id: user.companyId }).first();
    return company !== null && !company.suspended;
  }

  async withRefreshTokenLock<T>(
    userId: string,
    operation: (
      user: Awaited<ReturnType<AuthRepository['findUserById']>>,
      saveRefreshToken: (refreshToken: string | null) => Promise<void>,
      companyIsActive: boolean,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.db.transaction(async (tx) => {
      // A no-op update takes a PostgreSQL row lock until the transaction ends.
      // Concurrent refreshes then compare against the latest rotated hash.
      await tx.execute(
        this.prisma.db.raw.sql`UPDATE "users" SET "refreshToken" = "refreshToken" WHERE "id" = ${userId}`
          .affectedCount()
          .build(),
      );
      const user = await tx.orm.public.User.where({ id: userId }).first();
      const companyIsActive = user
        ? user.role === 'PLATFORM_ADMIN'
          ? user.companyId === null
          : user.companyId
            ? (await tx.orm.public.Company.where({ id: user.companyId }).first())?.suspended === false
            : false
        : false;
      return operation(user, async (refreshToken) => {
        await tx.orm.public.User.where({ id: userId }).update({ refreshToken });
      }, companyIsActive);
    });
  }

  async saveVerificationTokenVerifier(
    userId: string,
    verifier: string | null,
    expiresAt: Date | null,
  ): Promise<void> {
    await this.prisma.User.where({ id: userId }).update({
      verificationToken: verifier,
      verificationTokenExpiresAt: dateToInstant(expiresAt) as any,
    });
  }

  async consumeEmailVerificationToken(
    userId: string,
    candidateVerifier: string,
    now: Date,
  ): Promise<'verified' | 'already-verified' | 'expired' | 'invalid'> {
    return this.prisma.db.transaction(async (tx) => {
      await tx.execute(
        this.prisma.db.raw.sql`UPDATE "users" SET "verificationToken" = "verificationToken" WHERE "id" = ${userId}`
          .affectedCount()
          .build(),
      );
      const user = await tx.orm.public.User.where({ id: userId }).first();
      if (!user) return 'invalid';
      if (user.isEmailVerified) return 'already-verified';
      if (
        !matchesOneTimeTokenVerifier(
          user.verificationToken,
          candidateVerifier,
          'email-verification',
        )
      ) {
        return 'invalid';
      }
      if (
        !user.verificationTokenExpiresAt ||
        instantToMs(user.verificationTokenExpiresAt) <= now.getTime()
      ) {
        return 'expired';
      }

      await tx.orm.public.User.where({ id: userId }).update({
        isEmailVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
      });
      return 'verified';
    });
  }

  async reserveEmailVerificationToken(
    userId: string,
    verifier: string,
    expiresAt: Date,
    now: Date,
    expiryMs: number,
    cooldownMs: number,
  ) {
    return this.prisma.db.transaction(async (tx) => {
      await tx.execute(
        this.prisma.db.raw.sql`UPDATE "users" SET "verificationToken" = "verificationToken" WHERE "id" = ${userId}`
          .affectedCount().build(),
      );
      const user = await tx.orm.public.User.where({ id: userId }).first();
      if (!user) return { status: 'missing' as const };
      if (user.isEmailVerified) return { status: 'already-verified' as const };
      if (!user.email) return { status: 'email-required' as const };
      const lastSentAt = user.verificationTokenExpiresAt
        ? instantToMs(user.verificationTokenExpiresAt) - expiryMs : null;
      if (lastSentAt !== null && now.getTime() - lastSentAt < cooldownMs) {
        return { status: 'rate-limited' as const, retryAfterSeconds: Math.ceil((cooldownMs - (now.getTime() - lastSentAt)) / 1000) };
      }
      await tx.orm.public.User.where({ id: userId }).update({
        verificationToken: verifier,
        verificationTokenExpiresAt: dateToInstant(expiresAt),
      });
      return { status: 'reserved' as const, user: { id: user.id, email: user.email, fullName: user.fullName } };
    });
  }

  async consumePasswordResetToken(
    userId: string,
    candidateVerifier: string,
    now: Date,
    hashedPassword: string,
  ): Promise<boolean> {
    return this.prisma.db.transaction(async (tx) => {
      await tx.execute(
        this.prisma.db.raw.sql`UPDATE "users" SET "verificationToken" = "verificationToken" WHERE "id" = ${userId}`
          .affectedCount()
          .build(),
      );
      const user = await tx.orm.public.User.where({ id: userId }).first();
      if (
        !user ||
        !matchesOneTimeTokenVerifier(
          user.verificationToken,
          candidateVerifier,
          'password-reset',
        ) ||
        !user.verificationTokenExpiresAt ||
        instantToMs(user.verificationTokenExpiresAt) <= now.getTime()
      ) {
        return false;
      }

      await tx.orm.public.User.where({ id: userId }).update({
        password: hashedPassword,
        refreshToken: null,
        verificationToken: null,
        verificationTokenExpiresAt: null,
      });
      return true;
    });
  }

  async updateRefreshToken(
    userId: string,
    refreshToken: string | null,
  ): Promise<void> {
    try {
      await this.prisma.User.where({ id: userId }).update({ refreshToken });
    } catch (error: any) {
      if (error?.code === 'P2025' || error?.message?.includes('P2025')) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }
      throw new InternalServerErrorException('Failed to update refresh token');
    }
  }

  async createUserWithDefaultCompany(
    name: string,
    email: string,
    hashedPassword: string,
  ) {
    const existingUser = await this.prisma.User.where({ email }).first();

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    try {
      return await this.prisma.db.transaction(async (tx) => {
        const company = await tx.orm.public.Company.create({
          name: name ? `${name}'s Company` : `User's Company`,
          plan: 'TRIAL',
          suspended: false,
        });
        const user = await tx.orm.public.User.create({
          fullName: name,
          email,
          password: hashedPassword,
          role: 'COMPANY_ADMIN',
          companyId: company.id,
          isActive: true,
          isEmailVerified: false,
        });
        return { user, company };
      });
    } catch (error: any) {
      if (error?.code === 'P2002' || error?.message?.includes('P2002')) {
        throw new BadRequestException('Email already in use');
      }

      throw new InternalServerErrorException(
        'Failed to create user with company',
      );
    }
  }

  async updatePassword(id: string, hashedPassword: string) {
    try {
      return await this.prisma.User.where({ id }).update({
        password: hashedPassword,
      });
    } catch {
      throw new InternalServerErrorException('Failed to update password');
    }
  }

}
