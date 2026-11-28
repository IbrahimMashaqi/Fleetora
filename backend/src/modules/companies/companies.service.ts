import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Temporal } from 'temporal-polyfill';
import { trustedActivationOrigin } from '../../common/utils/frontend-url.js';
import { canonicalEmail } from '../../common/utils/email.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { FleetEvents } from '../fleet/fleet-events.js';
import { MailService } from '../mail/mail.service.js';
import { CompaniesRepository } from './companies.repository.js';
import type {
  AcceptCompanyAdminDto,
  CreateCompanyDto,
  CompanyPageDto,
  CompanyProfileDto,
  CompanyTransitionDto,
} from './companies.dto.js';
export const companyInvitationHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
@Injectable()
export class CompaniesService {
  private readonly origin: string;
  private readonly rounds: number;
  constructor(
    @Inject(CompaniesRepository)
    private readonly repository: CompaniesRepository,
    @Inject(ConfigService) config: ConfigService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(FleetEvents) private readonly events: FleetEvents,
  ) {
    this.origin = trustedActivationOrigin(config);
    this.rounds = Number(config.get('SALT_ROUNDS') ?? 10);
    if (!Number.isInteger(this.rounds) || this.rounds < 4 || this.rounds > 31)
      throw new Error('Invalid SALT_ROUNDS');
  }
  list(actor: TokenPayload, query: CompanyPageDto) {
    return this.repository.list(actor, query);
  }
  details(actor: TokenPayload, id: string) {
    return this.repository.details(actor, id);
  }
  self(actor: TokenPayload, profile = false) {
    return this.repository.self(actor, profile);
  }
  save(actor: TokenPayload, input: CompanyProfileDto, resubmit = false) {
    return this.repository.save(actor, input, resubmit);
  }
  async transition(
    actor: TokenPayload,
    id: string,
    input: CompanyTransitionDto,
  ) {
    const result = await this.repository.transition(actor, id, input);
    if (input.action === 'suspend' || input.action === 'reactivate')
      this.events.publish({
        name: 'fleet:company-access-revoked',
        data: { companyId: id },
      });
    return result;
  }
  async create(actor: TokenPayload, input: CreateCompanyDto) {
    await this.repository.authorize(actor, true);
    const token = randomBytes(32).toString('hex');
    // The reserved primary admin cannot sign in; no temporary password is disclosed.
    const password = await bcrypt.hash(
      randomBytes(32).toString('hex'),
      this.rounds,
    );
    const result = await this.repository.create(
      actor,
      { ...input, adminEmail: canonicalEmail(input.adminEmail) },
      password,
      {
        tokenHash: companyInvitationHash(token),
        expiresAt: Temporal.Now.instant().add({ hours: 48 }),
      },
    );
    return this.deliver(result, token);
  }
  async reissue(actor: TokenPayload, id: string) {
    const token = randomBytes(32).toString('hex');
    return this.deliver(
      await this.repository.reissue(actor, id, {
        tokenHash: companyInvitationHash(token),
        expiresAt: Temporal.Now.instant().add({ hours: 48 }),
      }),
      token,
    );
  }
  private async deliver(
    result: Awaited<ReturnType<CompaniesRepository['create']>>,
    token: string,
  ) {
    const url = new URL('/company/activate', this.origin);
    url.hash = new URLSearchParams({ token }).toString();
    let delivery: 'EMAIL' | 'MANUAL' = 'EMAIL';
    try {
      await this.mail.sendInvitationEmail({
        to: result.email,
        url: url.toString(),
        inviter: result.company.name,
        role: 'COMPANY_ADMIN',
        expiresAt: Temporal.Now.instant().add({ hours: 48 }).toString(),
      });
    } catch {
      delivery = 'MANUAL';
    }
    return { company: result.company, activationUrl: url.toString(), delivery };
  }
  async accept(input: AcceptCompanyAdminDto) {
    return this.repository.accept(
      companyInvitationHash(input.token),
      input.name.trim(),
      await bcrypt.hash(input.password, this.rounds),
    );
  }
}
