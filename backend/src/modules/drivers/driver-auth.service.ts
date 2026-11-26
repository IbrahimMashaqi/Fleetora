import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { TokenService } from '../auth/token/token.service.js';
import { createRefreshTokenVerifier } from '../auth/token/refresh-token-verifier.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { DriverIdentityRepository } from './driver-identity.repository.js';
import { normalizeDriverPhone } from './driver-phone.js';

@Injectable()
export class DriverAuthService {
  private dummy?: Promise<string>;
  private readonly rounds: number;
  constructor(
    @Inject(DriverIdentityRepository)
    private readonly repository: DriverIdentityRepository,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.rounds = Number(config.get<string | number>('SALT_ROUNDS') ?? 10);
    if (!Number.isInteger(this.rounds) || this.rounds < 4 || this.rounds > 31)
      throw new Error('Invalid SALT_ROUNDS');
  }
  async signin(identifier: string, password: string) {
    const phone = normalizeDriverPhone(identifier);
    const credential = await this.repository.credential(phone);
    this.dummy ??= bcrypt.hash(randomBytes(32).toString('hex'), this.rounds);
    const matches = await bcrypt.compare(
      password,
      credential?.user?.password ?? (await this.dummy),
    );
    if (!credential || !matches)
      throw new UnauthorizedException('Invalid credentials');
    return this.repository.session(
      credential,
      async (userId, companyId, workerId, sessionVersion) => {
        const payload: TokenPayload = {
          sub: userId,
          email: '',
          role: 'DRIVER',
          orgId: companyId,
          sessionVersion,
        };
        const [accessToken, refreshToken] = await Promise.all([
          this.tokens.generateAccessToken(payload),
          this.tokens.generateRefreshToken(payload),
        ]);
        return {
          refreshVerifier: createRefreshTokenVerifier(refreshToken),
          result: {
            accessToken,
            refreshToken,
            user: {
              id: userId,
              role: 'DRIVER' as const,
              workerId,
              orgId: companyId,
            },
          },
        };
      },
    );
  }
  me(actor: TokenPayload) {
    return this.repository.me(actor);
  }
}
