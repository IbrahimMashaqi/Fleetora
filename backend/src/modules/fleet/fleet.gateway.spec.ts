import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AuthRepository } from '../auth/auth.repository.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { FleetEvents } from './fleet-events.js';
import { FleetGateway } from './fleet.gateway.js';
import { FleetTicketsService } from './fleet-tickets.service.js';
import type { FleetEvent } from './fleet.types.js';

function nextEvent<T>(socket: Socket, name: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const onEvent = (value: T) => {
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      socket.off(name, onEvent);
      reject(new Error(`Timed out waiting for ${name}`));
    }, 2_000);
    socket.once(name, onEvent);
  });
}

describe('FleetGateway with real Socket.IO connections', () => {
  let app: INestApplication;
  let tickets: FleetTicketsService;
  let events: FleetEvents;
  let url: string;
  let actor: TokenPayload;
  let sequence = 0;
  const clients: Socket[] = [];
  const records = new Map<
    string,
    {
      id: string;
      email: string;
      role: string;
      companyId: string;
      isActive: boolean;
      isEmailVerified: boolean;
      company: { id: string; suspended: boolean };
    }
  >();
  const findSessionContextById = vi.fn(
    async (id: string) => records.get(id) ?? null,
  );

  function register(companyId = 'company-a'): TokenPayload {
    const id = `admin-${++sequence}`;
    const account: TokenPayload = {
      sub: id,
      email: `${id}@example.test`,
      role: 'COMPANY_ADMIN',
      orgId: companyId,
    };
    records.set(id, {
      id,
      email: account.email,
      role: account.role,
      companyId,
      isActive: true,
      isEmailVerified: true,
      company: { id: companyId, suspended: false },
    });
    return account;
  }

  function client(
    ticket?: string,
    origin: string | undefined = 'http://localhost:3000',
    extra: Record<string, unknown> = {},
  ): Socket {
    const socket = io(`${url}/fleet`, {
      transports: ['websocket'],
      path: '/socket.io',
      forceNew: true,
      reconnection: false,
      autoConnect: false,
      auth: ticket ? { ticket } : {},
      extraHeaders: origin ? { Origin: origin } : {},
      ...extra,
    });
    clients.push(socket);
    return socket;
  }

  async function connect(account = actor): Promise<Socket> {
    const issued = await tickets.issue(account);
    const socket = client(issued.ticket);
    const ready = nextEvent<{ companyId: string }>(socket, 'fleet:ready');
    socket.connect();
    expect(await ready).toEqual({ companyId: account.orgId });
    return socket;
  }

  const event = (companyId: string, revision = 1): FleetEvent => ({
    name: 'fleet:location-updated',
    data: {
      companyId,
      driverId: 'driver-a',
      serverTime: new Date().toISOString(),
      tracking: {
        revision,
        sharing: true,
        sharingStartedAt: null,
        location: {
          latitude: 31.5,
          longitude: 35.2,
          capturedAt: new Date().toISOString(),
          receivedAt: new Date().toISOString(),
          accuracy: 4,
          speed: null,
          heading: null,
        },
      },
    },
  });

  beforeAll(async () => {
    // Only intervals are virtual: HTTP, websocket I/O, timeouts and Date stay real.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const module = await Test.createTestingModule({
      providers: [
        FleetGateway,
        FleetEvents,
        FleetTicketsService,
        { provide: AuthRepository, useValue: { findSessionContextById } },
        {
          provide: ConfigService,
          useValue: new ConfigService({ NODE_ENV: 'test' }),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
    tickets = module.get(FleetTicketsService);
    events = module.get(FleetEvents);
  }, 30_000);

  beforeEach(() => {
    findSessionContextById.mockClear();
    findSessionContextById.mockImplementation(
      async (id: string) => records.get(id) ?? null,
    );
    actor = register();
  });
  afterEach(async () => {
    for (const socket of clients.splice(0)) socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  afterAll(async () => {
    await app.close();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('becomes ready only after authorizing and delivers events exclusively to the owning company', async () => {
    const own = await connect();
    const other = await connect(register('company-b'));
    const otherEvents = vi.fn();
    other.on('fleet:location-updated', otherEvents);
    const received = nextEvent(own, 'fleet:location-updated');
    const update = event(actor.orgId);
    events.publish(update);
    expect(await received).toEqual(update.data);
    expect(otherEvents).not.toHaveBeenCalled();
    expect(findSessionContextById).toHaveBeenCalledWith(actor.sub);
  });

  it('rejects missing tickets, replay, and tickets in query instead of handshake auth', async () => {
    const issued = await tickets.issue(actor);
    await tickets.consume(issued.ticket);
    for (const socket of [
      client(),
      client(issued.ticket),
      client(undefined, undefined, { query: { ticket: issued.ticket } }),
    ]) {
      const denied = nextEvent<Error>(socket, 'connect_error');
      socket.connect();
      expect((await denied).message).toBe('Fleet connection denied');
      expect(socket.connected).toBe(false);
    }
  });

  it.each([
    undefined,
    'https://attacker.example',
    'http://localhost:3000.evil.test',
    'null',
  ])('denies unapproved origin %s', async (origin) => {
    const issued = await tickets.issue(actor);
    // Explicitly override headers because undefined selects the helper default.
    const socket = client(issued.ticket, origin, {
      extraHeaders: origin ? { Origin: origin } : {},
    });
    const denied = nextEvent<Error>(socket, 'connect_error');
    socket.connect();
    expect((await denied).message).toBe('Fleet connection denied');
    // Origin rejection happens before consumption.
    await expect(tickets.consume(issued.ticket)).resolves.toEqual(actor);
  });

  it('denies role changes between ticket issue and connection', async () => {
    const issued = await tickets.issue(actor);
    const record = records.get(actor.sub)!;
    record.role = 'ACCOUNTANT';
    const socket = client(issued.ticket);
    const denied = nextEvent<Error>(socket, 'connect_error');
    socket.connect();
    expect((await denied).message).toBe('Fleet connection denied');
  });

  it.each(['role', 'company', 'active', 'verified', 'suspended', 'database'])(
    'disconnects on %s revocation before emitting a queued update',
    async (change) => {
      const socket = await connect();
      const received = vi.fn();
      socket.on('fleet:location-updated', received);
      const disconnected = nextEvent<string>(socket, 'disconnect');
      const record = records.get(actor.sub)!;
      if (change === 'role') record.role = 'MERCHANT';
      if (change === 'company') record.companyId = 'company-b';
      if (change === 'active') record.isActive = false;
      if (change === 'verified') record.isEmailVerified = false;
      if (change === 'suspended') record.company.suspended = true;
      if (change === 'database')
        findSessionContextById.mockRejectedValue(
          new Error('Database unavailable'),
        );
      events.publish(event(actor.orgId));
      expect(await disconnected).toBe('io server disconnect');
      expect(received).not.toHaveBeenCalled();
    },
  );

  it('revalidates idle connections, then permits a fresh authorized reconnect', async () => {
    const socket = await connect();
    records.get(actor.sub)!.isActive = false;
    const disconnected = nextEvent<string>(socket, 'disconnect');
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await disconnected).toBe('io server disconnect');
    records.get(actor.sub)!.isActive = true;
    const reconnected = await connect();
    const received = nextEvent(reconnected, 'fleet:location-updated');
    const update = event(actor.orgId, 2);
    events.publish(update);
    expect(await received).toEqual(update.data);
  });

  it('bounds each user to five sockets and releases capacity on disconnect', async () => {
    for (let index = 0; index < 5; index++) await connect();
    const sixth = client((await tickets.issue(actor)).ticket);
    const rejected = nextEvent<string>(sixth, 'disconnect');
    sixth.connect();
    expect(await rejected).toBe('io server disconnect');
    clients[0].disconnect();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await connect()).connected).toBe(true);
  });

  it('removes subscriptions on disconnect so future writes do not trigger authorization work', async () => {
    const socket = await connect();
    socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 20));
    findSessionContextById.mockClear();
    events.publish(event(actor.orgId));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(findSessionContextById).not.toHaveBeenCalled();
  });

  it('bounds queued updates and never emits after disconnect during a persisted check', async () => {
    const socket = await connect();
    const received = vi.fn();
    socket.on('fleet:location-updated', received);
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    findSessionContextById.mockImplementationOnce(async (id: string) => {
      await blocked;
      return records.get(id) ?? null;
    });
    const disconnected = nextEvent<string>(socket, 'disconnect');
    for (let index = 0; index < 131; index++) {
      const update = event(actor.orgId);
      if (update.name !== 'fleet:headquarters-updated')
        update.data.driverId = `driver-${index}`;
      events.publish(update);
    }
    expect(await disconnected).toBe('io server disconnect');
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received).not.toHaveBeenCalled();
  });
});

describe('FleetGateway origin configuration', () => {
  it.each([
    { NODE_ENV: 'production' },
    { NODE_ENV: 'production', FRONTEND_URL: 'http://example.com' },
    { FRONTEND_URL: 'https://example.com/path' },
    { FRONTEND_URL: 'https://user:password@example.com' },
    { FRONTEND_URL: 'invalid' },
  ])('rejects invalid runtime configuration %j', async (config) => {
    await expect(
      Test.createTestingModule({
        providers: [
          FleetGateway,
          FleetEvents,
          { provide: FleetTicketsService, useValue: {} },
          { provide: ConfigService, useValue: new ConfigService(config) },
        ],
      }).compile(),
    ).rejects.toThrow(/FRONTEND_URL/);
  });
});
