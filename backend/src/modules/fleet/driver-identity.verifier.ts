import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  JWT_ALGORITHM,
  readAccessTokenSecret,
} from '../auth/token/token-secrets.js';
import { AccessTokenStrategy } from '../auth/strategies/access-token.strategy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DriverIdentityVerifier } from './driver-telemetry.service.js';

@Injectable()
export class PersistedDriverIdentityVerifier implements DriverIdentityVerifier {
  private readonly secret: string;
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(AccessTokenStrategy) private readonly strategy: AccessTokenStrategy,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.secret = readAccessTokenSecret(config);
  }
  async verify(proof: unknown) {
    if (typeof proof !== 'string' || proof.length > 4096)
      throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync<Record<string, unknown>>(
        proof,
        { secret: this.secret, algorithms: [JWT_ALGORITHM] },
      );
      if (
        payload.role !== 'DRIVER' ||
        typeof payload.sub !== 'string' ||
        typeof payload.orgId !== 'string' ||
        typeof payload.email !== 'string' ||
        typeof payload.sessionVersion !== 'number'
      )
        throw new UnauthorizedException();
      const identity = {
        sub: payload.sub,
        role: 'DRIVER' as const,
        email: payload.email,
        orgId: payload.orgId,
        sessionVersion: payload.sessionVersion,
        ...(typeof payload.companyVersion === 'number' ? { companyVersion: payload.companyVersion } : {}),
        typ: payload.typ,
      };
      const actor = await this.strategy.validate(identity);
      if (actor.role !== 'DRIVER') throw new UnauthorizedException();
      const account = await this.prisma.db.orm.public.DriverAccount.where({
        userId: actor.sub,
        companyId: actor.orgId,
      })
        .select('workerId', 'companyId')
        .first();
      if (!account) throw new UnauthorizedException();
      return {
        kind: 'driver' as const,
        workerId: account.workerId,
        companyId: account.companyId,
      };
    } catch {
      throw new UnauthorizedException();
    }
  }
}
