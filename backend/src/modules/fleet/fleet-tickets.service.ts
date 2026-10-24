import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { AuthRepository } from '../auth/auth.repository.js';
import type { TokenPayload } from '../auth/token/token.payload.js';

type Ticket = { actor: TokenPayload; expiresAt: number };
type Rate = { count: number; expiresAt: number };

@Injectable()
export class FleetTicketsService implements OnModuleInit, OnModuleDestroy {
  private readonly tickets = new Map<string, Ticket>();
  private readonly rates = new Map<string, Rate>();
  private timer?: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(
    @Inject(AuthRepository)
    private readonly auth: Pick<AuthRepository, 'findSessionContextById'>,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.cleanup(), 30_000);
    this.timer.unref();
  }

  async issue(
    actor: TokenPayload,
  ): Promise<{ ticket: string; expiresAt: string }> {
    if (this.closed)
      throw new ServiceUnavailableException('Fleet realtime is unavailable');
    this.assertActor(actor);
    this.cleanup();
    const rate = this.rates.get(actor.sub);
    if (rate && rate.count >= 10) {
      throw new HttpException(
        'Too many fleet connection attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!rate && this.rates.size >= 10_000) {
      throw new ServiceUnavailableException('Fleet realtime is unavailable');
    }
    this.rates.set(actor.sub, {
      count: (rate?.count ?? 0) + 1,
      expiresAt: rate?.expiresAt ?? Date.now() + 60_000,
    });
    const validated = await this.validateActor(actor);
    if (this.closed || this.tickets.size >= 10_000) {
      throw new ServiceUnavailableException('Fleet realtime is unavailable');
    }
    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 30_000;
    this.tickets.set(this.digest(ticket), { actor: validated, expiresAt });
    return { ticket, expiresAt: new Date(expiresAt).toISOString() };
  }

  async consume(ticket: unknown): Promise<TokenPayload> {
    if (
      this.closed ||
      typeof ticket !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(ticket)
    ) {
      throw new UnauthorizedException('Invalid fleet connection ticket');
    }
    const key = this.digest(ticket);
    const stored = this.tickets.get(key);
    // Delete before awaiting persisted authorization: concurrent replays fail closed.
    this.tickets.delete(key);
    if (!stored || stored.expiresAt <= Date.now()) {
      throw new UnauthorizedException('Invalid fleet connection ticket');
    }
    const actor = await this.validateActor(stored.actor);
    if (this.closed || stored.expiresAt <= Date.now()) {
      throw new UnauthorizedException('Invalid fleet connection ticket');
    }
    return actor;
  }

  async validateActor(actor: TokenPayload): Promise<TokenPayload> {
    this.assertActor(actor);
    const user = await this.auth.findSessionContextById(actor.sub);
    if (
      !user ||
      user.id !== actor.sub ||
      user.role !== 'COMPANY_ADMIN' ||
      user.companyId !== actor.orgId ||
      !user.isActive ||
      !user.isEmailVerified ||
      !user.company ||
      user.company.id !== actor.orgId ||
      user.company.suspended
    ) {
      throw new ForbiddenException('Fleet tracking access denied');
    }
    return {
      sub: user.id,
      email: user.email ?? '',
      role: 'COMPANY_ADMIN',
      orgId: actor.orgId,
    };
  }

  onModuleDestroy(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.tickets.clear();
    this.rates.clear();
  }

  private assertActor(actor: TokenPayload): void {
    if (
      !actor ||
      actor.role !== 'COMPANY_ADMIN' ||
      !actor.sub ||
      !actor.orgId
    ) {
      throw new ForbiddenException('Fleet tracking access denied');
    }
  }

  private digest(ticket: string): string {
    return createHash('sha256').update(ticket).digest('hex');
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, ticket] of this.tickets) {
      if (ticket.expiresAt <= now) this.tickets.delete(key);
    }
    for (const [key, rate] of this.rates) {
      if (rate.expiresAt <= now) this.rates.delete(key);
    }
  }
}
