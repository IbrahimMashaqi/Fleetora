import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Temporal } from 'temporal-polyfill';
import { trustedActivationOrigin } from '../../common/utils/frontend-url.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { company } from '../parcels/parcel-domain.js';
import { DriverIdentityRepository } from './driver-identity.repository.js';

export const hashDriverToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
@Injectable()
export class DriverIdentityService {
  private readonly origin: string;
  private readonly rounds: number;
  constructor(
    @Inject(DriverIdentityRepository)
    private readonly repository: DriverIdentityRepository,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.origin = trustedActivationOrigin(config);
    this.rounds = Number(config.get<string | number>('SALT_ROUNDS') ?? 10);
    if (!Number.isInteger(this.rounds) || this.rounds < 4 || this.rounds > 31)
      throw new Error('Invalid SALT_ROUNDS');
  }
  overview(actor: TokenPayload, workerId: string) {
    return this.repository.overview(actor, workerId);
  }
  async issue(actor: TokenPayload, workerId: string) {
    company(actor, 'manageDrivers');
    const token = randomBytes(32).toString('hex');
    const invitation = await this.repository.issue(
      actor,
      workerId,
      hashDriverToken(token),
      Temporal.Now.instant().add({ hours: 48 }),
    );
    const url = new URL('/driver/activate', this.origin);
    url.hash = new URLSearchParams({ token }).toString();
    return { ...invitation, url: url.toString() };
  }
  revokeInvitation(actor: TokenPayload, workerId: string) {
    return this.repository.revokeInvitation(actor, workerId);
  }
  revokeAccess(actor: TokenPayload, workerId: string) {
    return this.repository.revokeAccess(actor, workerId);
  }
  offboard(actor: TokenPayload, workerId: string, revokeAccess: boolean) {
    return this.repository.offboard(actor, workerId, revokeAccess);
  }
  async accept(input: { token: string; password: string }) {
    if (!/^[a-f0-9]{64}$/.test(input.token))
      throw new BadRequestException('Invalid or expired invitation');
    const passwordHash = await bcrypt.hash(input.password, this.rounds);
    const outcome = await this.repository.accept(hashDriverToken(input.token), passwordHash);
    if (outcome !== 'ACCEPTED') throw new BadRequestException(
      outcome === 'EXPIRED' ? 'Driver invitation expired'
        : outcome === 'USED_OR_REVOKED' ? 'Driver invitation already used or revoked'
          : 'Invalid or expired invitation',
    );
    return { accepted: true as const };
  }
}
