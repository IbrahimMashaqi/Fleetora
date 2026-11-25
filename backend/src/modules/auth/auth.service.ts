import { trustedFrontendOrigin } from '../../common/utils/frontend-url.js';
import {
  BadRequestException,
  ConflictException,
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
import { createRefreshTokenVerifier, isLegacyRefreshTokenVerifier, matchesRefreshTokenVerifier } from './token/refresh-token-verifier.js';
import { MailService } from '../mail/mail.service.js';
import { instantToMs } from '../../common/utils/temporal.js';
import { canonicalEmail } from '../../common/utils/email.js';
import { randomBytes, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  createOneTimeTokenVerifier,
  matchesOneTimeTokenVerifier,
} from './token/one-time-token.js';

function recoveryFailureDetails(error: unknown) {
  if (typeof error !== 'object' || error === null) return { errorCode: 'UNKNOWN' };
  const code = 'code' in error ? error.code : undefined;
  const command = 'command' in error ? error.command : undefined;
  const responseCode = 'responseCode' in error ? error.responseCode : undefined;
  const safeCodes = [
    'EAUTH', 'ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'EDNS', 'EENVELOPE',
    'EMESSAGE', 'ESTREAM', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND',
    'EAI_AGAIN', 'ENOENT', 'ETLS', 'EPROTOCOL', 'CERT_HAS_EXPIRED',
    'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    '28P01', '42501', '42P01', 'CONTRACT.MARKER_READ_FAILED',
  ];
  const safeCommands = ['CONN', 'AUTH', 'AUTH LOGIN', 'AUTH PLAIN', 'AUTH XOAUTH2', 'EHLO', 'HELO', 'STARTTLS', 'MAIL FROM', 'RCPT TO', 'DATA'];
  return {
    errorCode: typeof code === 'string' && safeCodes.includes(code) ? code : 'UNKNOWN',
    ...(typeof command === 'string' && safeCommands.includes(command) ? { smtpCommand: command } : {}),
    ...(typeof responseCode === 'number' && Number.isInteger(responseCode) && responseCode >= 400 && responseCode <= 599
      ? { smtpResponseCode: responseCode } : {}),
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly PASSWORD_SALT_ROUNDS: number;
  private readonly VERIFICATION_CODE_EXPIRY_MINUTES: number;
  private readonly FRONTEND_URL: string;
  private readonly VERIFICATION_RESEND_COOLDOWN_MS = 60_000;
  private unknownAccountHash?: Promise<string>;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {
    const saltRounds = Number(this.configService.get<number | string>('SALT_ROUNDS') ?? 10);
    if (!Number.isInteger(saltRounds) || saltRounds < 4 || saltRounds > 31) {
      throw new Error('SALT_ROUNDS must be an integer from 4 to 31');
    }
    this.PASSWORD_SALT_ROUNDS = saltRounds;
    const verificationMinutes = Number(this.configService.get<number | string>('VERIFICATION_CODE_EXPIRY_MINUTES') ?? 15);
    if (!Number.isInteger(verificationMinutes) || verificationMinutes <= 0) {
      throw new Error('VERIFICATION_CODE_EXPIRY_MINUTES must be a positive integer');
    }
    this.VERIFICATION_CODE_EXPIRY_MINUTES = verificationMinutes;
    this.FRONTEND_URL = trustedFrontendOrigin(this.configService);
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

    const hashedRefreshToken = createRefreshTokenVerifier(refreshToken);
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
    const { password } = signinDto;
    const user = await this.authRepository.findUserByEmail(canonicalEmail(signinDto.email));
    if (!user) {
      // Spend the same bcrypt work as a real account so response timing does not reveal existence.
      await bcrypt.compare(password, await this.unknownAccountPasswordHash());
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

  private unknownAccountPasswordHash(): Promise<string> {
    this.unknownAccountHash ??= bcrypt.hash(
      randomBytes(32).toString('hex'),
      this.PASSWORD_SALT_ROUNDS,
    );
    return this.unknownAccountHash;
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
    await this.deliverVerificationEmail({ id: user.id, email: user.email, fullName: user.fullName }, token);
  }

  private async deliverVerificationEmail(user: { id: string; email: string; fullName: string }, token: string) {
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
    const { name, password } = createUserDto;
    const email = canonicalEmail(createUserDto.email);
    const hashedPassword = await bcrypt.hash(
      password,
      this.PASSWORD_SALT_ROUNDS,
    );

    // Persist the company and initial administrator atomically; send email afterward.
    const { user } = await this.authRepository.createUserWithDefaultCompany(
      name,
      email,
      hashedPassword,
      createUserDto.currency ?? 'ILS',
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
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.VERIFICATION_CODE_EXPIRY_MINUTES * 60_000);
    const verifier = createOneTimeTokenVerifier(token, 'email-verification');
    if (!verifier) throw new BadRequestException('Verification token is invalid');
    const reserved = await this.authRepository.reserveEmailVerificationToken(
      userId, verifier, expiresAt, now,
      this.VERIFICATION_CODE_EXPIRY_MINUTES * 60_000, this.VERIFICATION_RESEND_COOLDOWN_MS,
    );
    if (reserved.status === 'missing') throw new BadRequestException('User not found');
    if (reserved.status === 'email-required') throw new BadRequestException('User email is required for verification');
    if (reserved.status === 'already-verified') return { message: 'Email is already verified. You can sign in.' };
    if (reserved.status === 'rate-limited') {
      throw new HttpException(
        `Please wait ${reserved.retryAfterSeconds} seconds before requesting another verification email.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // The reservation commits before external email delivery; no network work holds the row lock.
    await this.deliverVerificationEmail(reserved.user, token);
    // The caller only holds a user ID; never echo the account's address back to it.
    return { message: 'Verification code sent. Please check your email.' };
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
        // Approved rollout: legacy bcrypt verifiers cannot safely prove the full JWT.
        if (isLegacyRefreshTokenVerifier(user.refreshToken)) {
          throw new UnauthorizedException('Please sign in again');
        }
        if (!matchesRefreshTokenVerifier(refreshToken, user.refreshToken)) {
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
        const hashedRefreshToken = createRefreshTokenVerifier(newRefreshToken);
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
      company: company
        ? { id: company.id, name: company.name, currency: company.currency }
        : null,
    };
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.authRepository.updateRefreshToken(userId, null);
    return { message: 'Logged out successfully' };
  }

  /**
   * Replaces the password and every refresh session in one conditional UPDATE, then
   * returns a fresh pair for the caller's own session. Access tokens issued earlier
   * remain valid until their ten-minute expiry; they are stateless by design.
   */
  async updatePassword(
    id: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<{
    success: boolean;
    message: string;
    accessToken: string;
    refreshToken: string;
  }> {
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
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email ?? '',
      role: user.role,
      orgId: user.companyId ?? '',
    };
    const refreshToken = await this.tokenService.generateRefreshToken(payload);
    const replaced = await this.authRepository.replacePasswordAndSession(
      id,
      user.password,
      hashedPassword,
      createRefreshTokenVerifier(refreshToken),
    );
    if (!replaced) {
      throw new ConflictException(
        'Your password was changed by another request. Sign in again to continue.',
      );
    }
    const accessToken = await this.tokenService.generateAccessToken(payload);
    return {
      success: true,
      message: 'Password updated successfully',
      accessToken,
      refreshToken,
    };
  }

  async sendForgotPasswordEmail(email: string) {
    const genericResponse = {
      message:
        'If an account exists for this email, password reset instructions will be sent.',
    };
    const requestId = randomUUID();
    const startedAt = Date.now();
    let stage = 'account_lookup';
    this.logger.log({ event: 'password_recovery.stage', requestId, stage, elapsedMs: 0 });

    try {
      const user = await this.authRepository.findUserByEmail(canonicalEmail(email));
      if (!user) return genericResponse;

      stage = 'token_generation';
      const token = randomBytes(32).toString('hex');
      const verifier = createOneTimeTokenVerifier(token, 'password-reset');
      if (!verifier) return genericResponse;

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);
      const resetUrl = new URL('/auth/reset-password', this.FRONTEND_URL);
      resetUrl.searchParams.set('userId', user.id);
      resetUrl.hash = new URLSearchParams({ token }).toString();
      stage = 'token_persistence';
      this.logger.log({ event: 'password_recovery.stage', requestId, stage, elapsedMs: Date.now() - startedAt });
      await this.authRepository.saveVerificationTokenVerifier(
        user.id,
        verifier,
        expiresAt,
      );
      stage = 'email_delivery';
      this.logger.log({ event: 'password_recovery.stage', requestId, stage, elapsedMs: Date.now() - startedAt });
      // Deliver to the address on record, never to a caller-typed variant of it.
      await this.mailService.sendResetPasswordEmail(
        user.email ?? canonicalEmail(email),
        user.fullName ?? 'User',
        resetUrl.toString(),
      );
    } catch (error) {
      this.logger.warn({
        event: 'password_recovery.failed', requestId, stage,
        elapsedMs: Date.now() - startedAt,
        ...recoveryFailureDetails(error),
      });
    } finally {
      this.logger.log({ event: 'password_recovery.completed', requestId, elapsedMs: Date.now() - startedAt });
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
