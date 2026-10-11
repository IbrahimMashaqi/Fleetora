import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthRepository } from '../auth.repository.js';
import { TokenPayload } from '../token/token.payload.js';

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private readonly authRepository: AuthRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('ACCESS_TOKEN_SECRET')!,
    });
  }

  async validate(payload: TokenPayload): Promise<TokenPayload> {
    const user = await this.authRepository.findUserById(payload.sub);
    if (
      !user ||
      !user.isActive ||
      !user.isEmailVerified ||
      !(await this.authRepository.isCompanyActiveForUser(user))
    ) {
      throw new UnauthorizedException();
    }
    return {
      sub: user.id,
      email: user.email ?? '',
      role: user.role,
      orgId: user.companyId ?? '',
    };
  }
}
