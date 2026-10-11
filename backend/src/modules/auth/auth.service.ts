import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
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
import {
  createOneTimeTokenVerifier,
  matchesOneTimeTokenVerifier,
} from './token/one-time-token.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly PASSWORD_SALT_ROUNDS: number;
  private readonly VERIFICATION_CODE_EXPIRY_MINUTES: number;
  private readonly FRONTEND_URL: string;
  private readonly VERIFICATION_RESEND_COOLDOWN_MS = 60_000;

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
    const configuredFrontendUrl = this.configService.get<string>('FRONTEND_URL');
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    if (!configuredFrontendUrl && isProduction) {
      throw new Error('FRONTEND_URL must be configured in production');
    }

    let frontendUrl: URL;
    try {
      frontendUrl = new URL(configuredFrontendUrl ?? 'http://localhost:3000');
    } catch {
      throw new Error('FRONTEND_URL must be a valid trusted frontend URL');
    }
    if (
      !['http:', 'https:'].includes(frontendUrl.protocol) ||
      frontendUrl.username ||
      frontendUrl.password ||
      frontendUrl.search ||
      frontendUrl.hash ||
      (isProduction && frontendUrl.protocol !== 'https:')
    ) {
      throw new Error('FRONTEND_URL must be a valid trusted frontend URL');
    }
    this.FRONTEND_URL = frontendUrl.origin;
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
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (
      !user.isActive ||
      !(await this.authRepository.isCompanyActiveForUser(user))
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isEmailVerified) {
      throw new ForbiddenException(
        'Please verify your email before signing in. Check your inbox for the verification code.',
      );
    }

    return this.buildAuthResponse(user);
  }

  async sendVerificationEmail(
    user: { id: string; email: string | null; fullName: string },
    token: string,
    expiresAt: Date,
  ) {
    if (!user.email) {
      throw new BadRequestException('User email is required for verification');
    }
    const verifier = createOneTimeTokenVerifier(token, 'email-verification');
    if (!verifier) {
      throw new BadRequestException('Verification token is invalid');
    }
    await this.authRepository.saveVerificationTokenVerifier(
      user.id,
      verifier,
      expiresAt,
    );
    const verificationLink = new URL(
      '/auth/verify-email',
      this.FRONTEND_URL,
    );
    verificationLink.searchParams.set('userId', user.id);
    verificationLink.hash = new URLSearchParams({ token }).toString();
    await this.mailService.sendVerificationEmail(
      user.email,
      user.fullName ?? 'User',
      verificationLink.toString(),
      this.VERIFICATION_CODE_EXPIRY_MINUTES,
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
    const candidateVerifier = createOneTimeTokenVerifier(
      token,
      'email-verification',
    );
    if (!candidateVerifier) {
      throw new ForbiddenException('Invalid verification code');
    }

    const result = await this.authRepository.consumeEmailVerificationToken(
      userId,
      candidateVerifier,
      new Date(),
    );
    if (result === 'already-verified') {
      return { message: 'Email is already verified. You can sign in.' };
    }
    if (result === 'expired') {
      throw new ForbiddenException(
        'Verification code has expired. Please request a new one.',
      );
    }
    if (result === 'invalid') {
      throw new ForbiddenException('Invalid verification code');
    }
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

    const now = Date.now();
    const lastSentAt = user.verificationTokenExpiresAt
      ? instantToMs(user.verificationTokenExpiresAt) -
        this.VERIFICATION_CODE_EXPIRY_MINUTES * 60_000
      : null;
    if (
      lastSentAt !== null &&
      now - lastSentAt < this.VERIFICATION_RESEND_COOLDOWN_MS
    ) {
      const retryAfterSeconds = Math.ceil(
        (this.VERIFICATION_RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000,
      );
      throw new HttpException(
        `Please wait ${retryAfterSeconds} seconds before requesting another verification email.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
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
    return this.authRepository.withRefreshTokenLock(
      userId,
      async (user, saveRefreshToken, companyIsActive) => {
        if (!user) throw new UnauthorizedException('Access Denied: User not found');
        if (!user.isActive || !companyIsActive) {
          throw new UnauthorizedException('Access Denied: Account is inactive');
        }
        if (!user.isEmailVerified) {
          throw new UnauthorizedException('Access Denied: Account is unverified');
        }
        if (!user.refreshToken) {
          throw new ForbiddenException('Access Denied: Session expired');
        }
        if (!(await bcrypt.compare(refreshToken, user.refreshToken))) {
          throw new ForbiddenException('Access Denied: Token mismatch');
        }

        const payload: TokenPayload = {
          sub: user.id,
          email: user.email ?? '',
          role: user.role,
          orgId: user.companyId ?? '',
        };
        const [accessToken, newRefreshToken] = await Promise.all([
          this.tokenService.generateAccessToken(payload),
          this.tokenService.generateRefreshToken(payload),
        ]);
        const hashedRefreshToken = await bcrypt.hash(
          newRefreshToken,
          this.PASSWORD_SALT_ROUNDS,
        );
        await saveRefreshToken(hashedRefreshToken);
        return {
          accessToken,
          refreshToken: newRefreshToken,
          user: {
            id: user.id,
            name: user.fullName,
            email: user.email ?? '',
            role: user.role,
            orgId: user.companyId ?? '',
          },
        };
      },
    );
  }

  async getSessionUser(userId: string) {
    const user = await this.authRepository.findSessionContextById(userId);
    if (
      !user ||
      user.id !== userId ||
      !user.isActive ||
      !user.isEmailVerified
    ) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    const isCompanylessPlatformAdmin =
      user.role === 'PLATFORM_ADMIN' &&
      user.companyId === null &&
      user.company === null;
    const hasActiveTenantContext =
      user.role !== 'PLATFORM_ADMIN' &&
      user.companyId !== null &&
      user.company !== null &&
      user.company.id === user.companyId &&
      !user.company.suspended;

    if (!isCompanylessPlatformAdmin && !hasActiveTenantContext) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    const company = isCompanylessPlatformAdmin ? null : user.company;

    return {
      id: user.id,
      name: user.fullName,
      email: user.email,
      role: user.role,
      orgId: user.companyId,
      company: company ? { id: company.id, name: company.name } : null,
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
    if (
      !user.isActive ||
      !user.isEmailVerified ||
      !(await this.authRepository.isCompanyActiveForUser(user))
    ) {
      throw new UnauthorizedException();
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
    const genericResponse = {
      message:
        'If an account exists for this email, password reset instructions will be sent.',
    };

    try {
      const user = await this.authRepository.findUserByEmail(email);
      if (!user) return genericResponse;

      const token = randomBytes(32).toString('hex');
      const verifier = createOneTimeTokenVerifier(token, 'password-reset');
      if (!verifier) return genericResponse;

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);
      const resetUrl = new URL('/auth/reset-password', this.FRONTEND_URL);
      resetUrl.searchParams.set('userId', user.id);
      resetUrl.hash = new URLSearchParams({ token }).toString();
      await this.authRepository.saveVerificationTokenVerifier(
        user.id,
        verifier,
        expiresAt,
      );
      await this.mailService.sendResetPasswordEmail(
        email,
        user.fullName ?? 'User',
        resetUrl.toString(),
      );
    } catch {
      this.logger.warn('Password recovery request could not be completed');
    }

    return genericResponse;
  }

  async resetPassword(id: string, token: string, newPassword: string) {
    const user = await this.authRepository.findUserById(id);
    const candidateVerifier = createOneTimeTokenVerifier(token, 'password-reset');
    const now = new Date();
    if (
      !user ||
      !candidateVerifier ||
      !user.verificationTokenExpiresAt ||
      instantToMs(user.verificationTokenExpiresAt) <= now.getTime() ||
      !matchesOneTimeTokenVerifier(
        user.verificationToken,
        candidateVerifier,
        'password-reset',
      )
    ) {
      throw new BadRequestException('Invalid or expired password reset link');
    }

    const hashedPassword = await bcrypt.hash(
      newPassword,
      this.PASSWORD_SALT_ROUNDS,
    );

    const consumed = await this.authRepository.consumePasswordResetToken(
      id,
      candidateVerifier,
      now,
      hashedPassword,
    );
    if (!consumed) {
      throw new BadRequestException('Invalid or expired password reset link');
    }
    return { message: 'Password updated successfully' };
  }
}
