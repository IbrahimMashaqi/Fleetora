import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  MethodNotAllowedException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { SigninDto } from './dto/signin.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { AccessTokenGuard } from './guards/access-token.guard.js';
import { RefreshTokenGuard } from './guards/refresh-token.guard.js';
import { GetCurrentUser } from './decorators/get-current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { UpdatePasswordDto } from './dto/update-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import {
  RECOVERY_RATE_LIMITER,
  type RecoveryRateLimiter,
} from './recovery-rate-limiter.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    @Inject(RECOVERY_RATE_LIMITER)
    private readonly recoveryRateLimiter: RecoveryRateLimiter,
  ) {}

  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered, check email for verification' })
  @Public()
  @Post('signup')
  async signup(@Body() createUserDto: CreateUserDto) {
    return this.authService.signup(createUserDto);
  }

  @ApiOperation({ summary: 'Require explicit POST confirmation for email verification' })
  @ApiResponse({ status: 405, description: 'Email verification requires explicit confirmation' })
  @Public()
  @Header('Allow', 'POST')
  @Get('verify-email')
  verifyEmailGet(): never {
    throw new MethodNotAllowedException(
      'Email verification requires an explicit POST confirmation',
    );
  }

  @ApiOperation({ summary: 'Redeem a verification token after explicit confirmation' })
  @ApiResponse({ status: 200, description: 'Email verified' })
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.authService.verifyEmail(
      verifyEmailDto.userId,
      verifyEmailDto.token,
    );
  }

  @ApiOperation({ summary: 'Resend verification code' })
  @ApiResponse({ status: 200, description: 'Verification code sent' })
  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() resendDto: ResendVerificationDto) {
    return this.authService.resendVerificationCode(resendDto.userId);
  }

  @ApiOperation({ summary: 'Sign in and receive tokens' })
  @ApiResponse({ status: 200, description: 'Signed in' })
  @Public()
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  async signin(@Body() signinDto: SigninDto) {
    return this.authService.signin(signinDto);
  }

  @ApiOperation({ summary: 'Refresh access and refresh tokens' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Tokens refreshed' })
  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @GetCurrentUser('sub') id: string,
    @GetCurrentUser('refreshToken') refreshToken: string,
  ) {
    return this.authService.refreshTokens(id, refreshToken);
  }

  @ApiOperation({ summary: 'Get the current active user session' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Current user session' })
  @UseGuards(AccessTokenGuard)
  @Get('session')
  async session(@GetCurrentUser('sub') id: string) {
    return this.authService.getSessionUser(id);
  }

  @ApiOperation({ summary: 'Log out and invalidate refresh token' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Logged out' })
  @UseGuards(AccessTokenGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@GetCurrentUser('sub') userId: string) {
    return this.authService.logout(userId);
  }

  @ApiOperation({ summary: 'Change password while authenticated' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Password updated' })
  @UseGuards(AccessTokenGuard)
  @Post('update-password')
  @HttpCode(HttpStatus.OK)
  async updatePassword(
    @GetCurrentUser('sub') id: string,
    @Body() updatePasswordDto: UpdatePasswordDto,
  ) {
    return this.authService.updatePassword(
      id,
      updatePasswordDto.oldPassword,
      updatePasswordDto.newPassword,
    );
  }

  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent' })
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @Req() request: Pick<Request, 'ip'>,
  ) {
    const limit = this.recoveryRateLimiter.consume(
      request.ip ?? 'unknown',
      forgotPasswordDto.email,
    );
    if (!limit.allowed) {
      throw new HttpException(
        {
          message:
            'Too many password recovery requests. Please try again later.',
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.authService.sendForgotPasswordEmail(forgotPasswordDto.email);
  }

  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset' })
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.id,
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );
  }
}
