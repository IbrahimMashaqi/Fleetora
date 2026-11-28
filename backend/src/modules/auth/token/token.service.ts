import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenPayload } from './token.payload.js';
import { randomUUID } from 'node:crypto';
import { JWT_ALGORITHM, readTokenSecrets, type TokenType } from './token-secrets.js';

@Injectable()
export class TokenService {
  private readonly secrets: { access: string; refresh: string };

  constructor(
    private jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.secrets = readTokenSecrets(configService);
  }

  // Only the identity claims are copied; the issued type is never caller-controlled.
  private claims(payload: TokenPayload, typ: TokenType) {
    const { sub, email, role, orgId } = payload;
    return { sub, email, role, orgId, typ,
      ...(['DRIVER','PLATFORM_ADMIN'].includes(role) ? { sessionVersion: payload.sessionVersion } : {}),
      ...(role !== 'PLATFORM_ADMIN' ? { companyVersion: payload.companyVersion } : {}) };
  }

  async generateAccessToken(payload: TokenPayload): Promise<string> {
    return this.jwtService.signAsync(this.claims(payload, 'access'), {
      secret: this.secrets.access,
      algorithm: JWT_ALGORITHM,
      expiresIn: '10m',
    });
  }

  async generateRefreshToken(payload: TokenPayload): Promise<string> {
    return this.jwtService.signAsync(this.claims(payload, 'refresh'), {
      secret: this.secrets.refresh,
      algorithm: JWT_ALGORITHM,
      expiresIn: '7d',
      jwtid: randomUUID(),
    });
  }
}
