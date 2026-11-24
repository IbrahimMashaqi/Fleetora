import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { dateToInstant, instantToMs } from '../../common/utils/temporal.js';
import { matchesOneTimeTokenVerifier } from './token/one-time-token.js';

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = 'code' in error ? String(error.code) : '';
  const sqlState = 'sqlState' in error ? String(error.sqlState) : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  return code === 'P2002' || code === '23505' || sqlState === '23505' || message.includes('P2002');
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Case-insensitive identity lookup. Both sides use PostgreSQL lower(), exactly as
   * the users_email_lower unique index does, so legacy mixed-case rows still match.
   */
  async findUserByEmail(email: string) {
    const rows = await this.prisma.db.runtime().query(
      this.prisma.db.raw.sql`SELECT "id" FROM "users" WHERE lower("email") = lower(${email}) LIMIT 2`
        .returnsRow({ id: 'pg/text@1' })
        .build(),
    );
    if (rows.length === 0) return null;
    // Only possible before the users_email_lower migration; never guess which account is meant.
    if (rows.length > 1) {
      throw new InternalServerErrorException('Account identity is ambiguous');
    }
    return this.prisma.User.where({ id: rows[0].id }).first();
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
    const existingUser = await this.findUserByEmail(email);

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
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email already in use');
      }

      throw new InternalServerErrorException(
        'Failed to create user with company',
      );
    }
  }

  /**
   * Compare-and-swap: succeeds only while the stored hash is still the one the caller
   * verified, and replaces the refresh verifier in the same statement so every
   * previously issued refresh token stops working atomically with the new password.
   */
  async replacePasswordAndSession(
    id: string,
    expectedPasswordHash: string,
    passwordHash: string,
    refreshTokenVerifier: string,
  ): Promise<boolean> {
    try {
      return await this.prisma.db.transaction(async (tx) => {
        // A conditional ORM update is not atomic under concurrency; lock the row,
        // then recheck the hash, exactly like refresh-token rotation does.
        await tx.execute(
          this.prisma.db.raw.sql`SELECT "id" FROM "users" WHERE "id" = ${id} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        const current = await tx.orm.public.User.where({ id })
          .select('password')
          .first();
        if (!current || current.password !== expectedPasswordHash) return false;
        await tx.orm.public.User.where({ id }).update({
          password: passwordHash,
          refreshToken: refreshTokenVerifier,
        });
        return true;
      });
    } catch {
      throw new InternalServerErrorException('Failed to update password');
    }
  }

}
