import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.js';
import { AuthRepository } from './auth.repository.js';
import * as bcrypt from 'bcrypt';
import { SigninDto } from './dto/signin.dto.js';
import { TokenPayload, UserRole } from './token/token.payload.js';
import { TokenService } from './token/token.service.js';
import { MailService } from '../mail/mail.service.js';
import { instantToMs } from '../../common/utils/temporal.js';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private readonly PASSWORD_SALT_ROUNDS: number;
  private readonly VERIFICATION_CODE_EXPIRY_MINUTES: number;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {
    this.PASSWORD_SALT_ROUNDS =
      this.configService.get<number>('SALT_ROUNDS') ?? 10;
    this.VERIFICATION_CODE_EXPIRY_MINUTES =
      this.configService.get<number>('VERIFICATION_CODE_EXPIRY_MINUTES') ?? 15;
  }

  private async buildAuthResponse(user: {
    id: string;
    email: string | null;
    fullName: string;
    role: UserRole;
    companyId: string | null;
  }) {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email ?? '',
      role: user.role,
      orgId: user.companyId ?? '',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.generateAccessToken(payload),
      this.tokenService.generateRefreshToken(payload),
    ]);

    const hashedRefreshToken = await bcrypt.hash(
      refreshToken,
      this.PASSWORD_SALT_ROUNDS,
    );
    await this.authRepository.updateRefreshToken(user.id, hashedRefreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        role: user.role,
        orgId: user.companyId,
      },
    };
  }
  async signin(signinDto: SigninDto) {
    const { email, password } = signinDto;
    const user = await this.authRepository.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isEmailVerified) {
      throw new ForbiddenException(
        'Please verify your email before signing in. Check your inbox for the verification code.',
      );
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  async sendVerificationEmail(user: any, token: string, expiresAt: Date) {
    await this.authRepository.saveVerificationCode(user.id, token, expiresAt);
    const verificationLink = `http://localhost:3000/auth/verify-email?token=${token}&userId=${user.id}`;
    await this.mailService.sendVerificationEmail(
      user.email,
      user.fullName ?? 'User',
      verificationLink,
    );
  }
  async signup(createUserDto: CreateUserDto) {
    const { name, email, password } = createUserDto;
    const hashedPassword = await bcrypt.hash(
      password,
      this.PASSWORD_SALT_ROUNDS,
    );

    // Create user with default organization and membership in a transaction
    const { user } = await this.authRepository.createUserWithDefaultCompany(
      name,
      email,
      hashedPassword,
    );
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + this.VERIFICATION_CODE_EXPIRY_MINUTES,
    );

    await this.sendVerificationEmail(user, token, expiresAt);
    return {
      message:
        'User registered successfully. Please check your email for verification code.',
      userId: user.id,
      email: user.email,
    };
  }

  async verifyEmail(userId: string, token: string) {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.isEmailVerified) {
      return { message: 'Email is already verified. You can sign in.' };
    }
    if (!user.verificationToken || !user.verificationTokenExpiresAt) {
      throw new BadRequestException(
        'No verification code found. Please request a new one.',
      );
    }
    if (user.verificationToken !== token) {
      throw new ForbiddenException('Invalid verification code');
    }
    if (instantToMs(user.verificationTokenExpiresAt) < Date.now()) {
      throw new ForbiddenException(
        'Verification code has expired. Please request a new one.',
      );
    }

    await this.authRepository.markEmailVerified(userId);
    await this.authRepository.updateUserActevity(userId, true);
    return { message: 'Email verified successfully. You can now sign in.' };
  }

  async resendVerificationCode(userId: string) {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.isEmailVerified) {
      return { message: 'Email is already verified. You can sign in.' };
    }
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + this.VERIFICATION_CODE_EXPIRY_MINUTES,
    );

    await this.sendVerificationEmail(user, token, expiresAt);
    return {
      message: 'Verification code sent. Please check your email.',
      email: user.email,
    };
  }

  async refreshTokens(
    userId: string,
    refreshToken: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      orgId: string;
    };
  }> {
    const user = await this.authRepository.findUserById(userId);
    if (!user) throw new UnauthorizedException('Access Denied: User not found');

    if (!user.refreshToken) {
      throw new ForbiddenException('Access Denied: Session expired');
    }

    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );

    if (!refreshTokenMatches)
      throw new ForbiddenException('Access Denied: Token mismatch');

    const currentMembership = { role: user.role, organizationId: user.companyId };

    const payload: TokenPayload = {
      sub: user.id,
      email: user.email ?? '',
      role: user.role,
      orgId: currentMembership.organizationId ?? '',
    };

    const [accessToken, newRefreshToken] = await Promise.all([
      this.tokenService.generateAccessToken(payload),
      this.tokenService.generateRefreshToken(payload),
    ]);

    const hashedRefreshToken = await bcrypt.hash(
      newRefreshToken,
      this.PASSWORD_SALT_ROUNDS,
    );
    await this.authRepository.updateRefreshToken(user.id, hashedRefreshToken);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email ?? '',
        role: currentMembership.role,
        orgId: currentMembership.organizationId ?? '',
      },
    };
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.authRepository.updateRefreshToken(userId, null);
    return { message: 'Logged out successfully' };
  }

  async updatePassword(
    id: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.authRepository.findUserById(id);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (!(await bcrypt.compare(oldPassword, user.password))) {
      throw new BadRequestException('Last password is incorrect');
    }
    const hashedPassword = await bcrypt.hash(
      newPassword,
      this.PASSWORD_SALT_ROUNDS,
    );
    await this.authRepository.updatePassword(id, hashedPassword);
    return { success: true, message: 'Password updated successfully' };
  }

  async sendForgotPasswordEmail(email: string) {
    const user = await this.authRepository.findUserByEmail(email);
    if (!user) throw new BadRequestException('User not found');

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes expiry
    const updatePasswordUrl = `http://localhost:3000/auth/reset-password?token=${token}&userId=${user.id}`;
    await this.authRepository.saveVerificationCode(user.id, token, expiresAt);
    return await this.mailService.sendResetPasswordEmail(
      email,
      user.fullName ?? 'User',
      updatePasswordUrl,
    );
  }

  async resetPassword(id: string, token: string, newPassword: string) {
    const user = await this.authRepository.findUserById(id);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const verificationCode = user.verificationToken;
    if (!verificationCode || verificationCode !== token) {
      throw new BadRequestException('Invalid verification code');
    }

    const expiresAt = user.verificationTokenExpiresAt;
    if (!expiresAt || instantToMs(expiresAt) < Date.now()) {
      throw new BadRequestException('Invalid verification code');
    }

    const hashedPassword = await bcrypt.hash(
      newPassword,
      this.PASSWORD_SALT_ROUNDS,
    );

    await this.authRepository.updatePassword(id, hashedPassword);
    await this.authRepository.saveVerificationCode(id, null, null);
    return { message: 'Password updated successfully' };
  }
}
