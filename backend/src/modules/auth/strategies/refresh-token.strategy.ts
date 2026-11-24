import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  hasTokenType,
  JWT_ALGORITHM,
  readTokenSecrets,
} from '../token/token-secrets.js';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: readTokenSecrets(config).refresh,
      algorithms: [JWT_ALGORITHM],
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: Record<string, unknown>) {
    if (!hasTokenType(payload, 'refresh')) throw new UnauthorizedException();
    const refreshToken = req.get('authorization')?.replace('Bearer', '').trim();
    return {
      ...payload,
      refreshToken,
    };
  }
}
