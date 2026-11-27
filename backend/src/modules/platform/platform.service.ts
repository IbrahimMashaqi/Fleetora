import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Temporal } from 'temporal-polyfill';
import { trustedActivationOrigin } from '../../common/utils/frontend-url.js';
import { canonicalEmail } from '../../common/utils/email.js';
import { PlatformRepository } from './platform.repository.js';
import { MailService } from '../mail/mail.service.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { bootstrapEmail, type PlatformRole } from './platform-policy.js';
import type {
  AcceptPlatformInvitationDto,
  PlatformInvitationDto,
  PlatformMemberDto,
} from './platform.dto.js';
export const hashPlatformToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
@Injectable()
export class PlatformService {
  private readonly origin: string;
  private readonly salt: number;
  constructor(
    @Inject(PlatformRepository) private readonly repository: PlatformRepository,
    @Inject(ConfigService) config: ConfigService,
    @Inject(MailService) private readonly mail: MailService,
  ) {
    this.origin = trustedActivationOrigin(config);
    this.salt = Number(config.get('SALT_ROUNDS') ?? 10);
    if (!Number.isInteger(this.salt) || this.salt < 4 || this.salt > 31)
      throw new Error('Invalid SALT_ROUNDS');
  }
  me(actor: TokenPayload) {
    return this.repository.identity(actor);
  }
  overview(actor: TokenPayload) {
    return this.repository.overview(actor);
  }
  audit(actor: TokenPayload) {
    return this.repository.auditEvents(actor);
  }
  update(actor: TokenPayload, id: string, input: PlatformMemberDto) {
    return this.repository.update(actor, id, input);
  }
  revoke(actor: TokenPayload, id: string) {
    return this.repository.revoke(actor, id);
  }
  async bootstrap(email: string) {
    const issued = await this.invite(
      null,
      bootstrapEmail(['--email', email], {}),
      'SUPER_ADMIN',
    );
    if (issued.delivery !== 'EMAIL')
      throw new ServiceUnavailableException(
        'Bootstrap invitation saved; email delivery failed. Rerun with the same email.',
      );
    return { invitationId: issued.id, delivery: issued.delivery };
  }
  issue(actor: TokenPayload, input: PlatformInvitationDto) {
    return this.invite(actor, input.email, input.role);
  }
  private async invite(
    actor: TokenPayload | null,
    email: string,
    role: PlatformRole,
  ) {
    const token = randomBytes(32).toString('hex');
    const invitation = await this.repository.invite(actor, {
      email: canonicalEmail(email),
      role,
      tokenHash: hashPlatformToken(token),
      expiresAt: Temporal.Now.instant().add({ hours: 48 }),
    });
    const url = new URL('/platform/activate', this.origin);
    url.hash = new URLSearchParams({ token }).toString();
    let delivery: 'EMAIL' | 'MANUAL' = 'EMAIL';
    try {
      await this.mail.sendInvitationEmail({
        to: invitation.email,
        url: url.toString(),
        inviter: 'Fleetora Platform',
        role,
        expiresAt: invitation.expiresAt.toString(),
      });
    } catch {
      delivery = 'MANUAL';
    }
    return {
      id: invitation.id,
      email: invitation.email,
      role,
      activationUrl: url.toString(),
      delivery,
    };
  }
  async accept(input: AcceptPlatformInvitationDto) {
    const hash = await bcrypt.hash(input.password, this.salt);
    return this.repository.accept(
      hashPlatformToken(input.token),
      input.name.trim(),
      hash,
    );
  }
}
