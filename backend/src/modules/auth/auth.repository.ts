import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { dateToInstant } from '../../common/utils/temporal.js';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(name: string, email: string, hashedPassword: string) {
    const existingUser = await this.prisma.User.where({ email }).first();

    if (existingUser) {
      throw new BadRequestException('Email already in use');
    }

    try {
      return await this.prisma.User.create({
        fullName: name,
        email,
        password: hashedPassword,
        role: 'MERCHANT',
        isActive: true,
        isEmailVerified: false,
      });
    } catch {
      throw new InternalServerErrorException('Failed to create user');
    }
  }

  async findUserByEmail(email: string) {
    return this.prisma.User.where({ email }).first();
  }

  async findUserById(userId: string) {
    return this.prisma.User.where({ id: userId }).first();
  }

  async saveVerificationCode(
    userId: string,
    code: string | null,
    expiresAt: Date | null,
  ): Promise<void> {
    await this.prisma.User.where({ id: userId }).update({
      verificationToken: code,
      verificationTokenExpiresAt: dateToInstant(expiresAt) as any,
    });
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.prisma.User.where({ id: userId }).update({
      isEmailVerified: true,
      verificationToken: null,
      verificationTokenExpiresAt: null,
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

  async userExistsByEmail(email: string): Promise<boolean> {
    const user = await this.prisma.User.where({ email }).first();
    return user !== null;
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
      const company = await this.prisma.Company.create({
        name: name ? `${name}'s Company` : `User's Company`,
        plan: 'TRIAL',
        suspended: false,
      });

      const user = await this.prisma.User.create({
        fullName: name,
        email,
        password: hashedPassword,
        role: 'COMPANY_ADMIN',
        companyId: company.id,
        isActive: true,
        isEmailVerified: false,
      });

      return { user, company };
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

  async updateUserActevity(id: string, active: boolean) {
    try {
      return this.prisma.User.where({ id }).update({ isActive: active });
    } catch {
      throw new InternalServerErrorException('Connection failed to database');
    }
  }
}
