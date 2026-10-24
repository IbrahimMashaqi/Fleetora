import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload, UserRole } from '../auth/token/token.payload.js';
import { FleetTicketsService } from './fleet-tickets.service.js';

const actor: TokenPayload = {
  sub: 'admin-a',
  email: 'admin@example.test',
  role: 'COMPANY_ADMIN',
  orgId: 'company-a',
};
const user = {
  id: actor.sub,
  email: actor.email,
  role: actor.role,
  companyId: actor.orgId,
  isActive: true,
  isEmailVerified: true,
  company: { id: actor.orgId, suspended: false },
};

describe('FleetTicketsService', () => {
  let service: FleetTicketsService;
  const findSessionContextById = vi.fn();

  beforeEach(() => {
    findSessionContextById.mockReset().mockResolvedValue(user);
    service = new FleetTicketsService({ findSessionContextById });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T10:00:00Z'));
    service.onModuleInit();
  });
  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
  });

  it('issues an opaque 32-byte ticket valid for 30 seconds and consumes it once', async () => {
    const issued = await service.issue(actor);
    expect(Buffer.from(issued.ticket, 'base64url')).toHaveLength(32);
    expect(issued.ticket).not.toContain(actor.sub);
    expect(issued.expiresAt).toBe('2026-10-17T10:00:30.000Z');
    expect(await service.consume(issued.ticket)).toEqual(actor);
    await expect(service.consume(issued.ticket)).rejects.toThrow(
      'Invalid fleet connection ticket',
    );
  });

  it('allows only one of two concurrent consumers', async () => {
    const issued = await service.issue(actor);
    const consumed = await Promise.allSettled([
      service.consume(issued.ticket),
      service.consume(issued.ticket),
    ]);
    expect(consumed.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
  });

  it('expires tickets at the exact boundary and after a slow persisted check', async () => {
    const issued = await service.issue(actor);
    vi.advanceTimersByTime(30_000);
    await expect(service.consume(issued.ticket)).rejects.toThrow();
    const second = await service.issue(actor);
    findSessionContextById.mockImplementationOnce(async () => {
      vi.advanceTimersByTime(30_000);
      return user;
    });
    await expect(service.consume(second.ticket)).rejects.toThrow();
  });

  it.each([undefined, null, {}, '', 'a'.repeat(44), 'a'.repeat(43)])(
    'rejects invalid tickets %j',
    async (ticket) => {
      await expect(service.consume(ticket)).rejects.toThrow();
    },
  );

  it.each<UserRole>(['PLATFORM_ADMIN', 'MERCHANT', 'ACCOUNTANT'])(
    'denies %s without a persisted lookup',
    async (role) => {
      await expect(service.issue({ ...actor, role })).rejects.toThrow(
        'Fleet tracking access denied',
      );
      expect(findSessionContextById).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    { ...user, role: 'ACCOUNTANT' },
    { ...user, isActive: false },
    { ...user, isEmailVerified: false },
    { ...user, companyId: 'company-b' },
    { ...user, company: null },
    { ...user, company: { id: 'company-b', suspended: false } },
    { ...user, company: { id: actor.orgId, suspended: true } },
  ])('denies persisted unauthorized contexts %j', async (context) => {
    findSessionContextById.mockResolvedValue(context);
    await expect(service.issue(actor)).rejects.toThrow(
      'Fleet tracking access denied',
    );
  });

  it('burns a ticket when persisted authorization changes or the database fails', async () => {
    const issued = await service.issue(actor);
    findSessionContextById.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(service.consume(issued.ticket)).rejects.toThrow();
    await expect(service.consume(issued.ticket)).rejects.toThrow(
      'Invalid fleet connection ticket',
    );
    const second = await service.issue(actor);
    findSessionContextById.mockResolvedValue({ ...user, role: 'MERCHANT' });
    await expect(service.consume(second.ticket)).rejects.toThrow(
      'Fleet tracking access denied',
    );
  });

  it('limits issuance per user without races and recovers after the window', async () => {
    const requests = await Promise.allSettled(
      Array.from({ length: 11 }, () => service.issue(actor)),
    );
    expect(
      requests.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(10);
    expect(
      requests.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    vi.advanceTimersByTime(60_000);
    await expect(service.issue(actor)).resolves.toHaveProperty('ticket');
  });

  it('cleans up its timer, tickets and rejects operations after shutdown', async () => {
    const issued = await service.issue(actor);
    expect(vi.getTimerCount()).toBe(1);
    service.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
    await expect(service.consume(issued.ticket)).rejects.toThrow();
    await expect(service.issue(actor)).rejects.toThrow();
  });
});
