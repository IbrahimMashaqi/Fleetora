import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthRepository } from '../auth.repository.js';
import { TokenPayload } from '../token/token.payload.js';
import {
  hasTokenType,
  JWT_ALGORITHM,
  readAccessTokenSecret,
} from '../token/token-secrets.js';

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly authRepository: AuthRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: readAccessTokenSecret(configService),
      algorithms: [JWT_ALGORITHM],
    });
  }

  async validate(payload: TokenPayload): Promise<TokenPayload> {
    if (!hasTokenType(payload, 'access')) throw new UnauthorizedException();
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
