import { Inject, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { FleetEvents } from './fleet-events.js';
import { FleetTicketsService } from './fleet-tickets.service.js';
import type { FleetEvent } from './fleet.types.js';

type Connection = {
  actor: TokenPayload;
  unsubscribe: () => void;
  pending: Map<string, FleetEvent>;
  flushing: boolean;
  checking: boolean;
  ready: boolean;
};

@WebSocketGateway({
  namespace: '/fleet',
  path: '/socket.io',
  transports: ['websocket'],
  maxHttpBufferSize: 1_024,
  serveClient: false,
})
export class FleetGateway
  implements
    OnGatewayInit<Namespace>,
    OnGatewayConnection<Socket>,
    OnGatewayDisconnect<Socket>,
    OnModuleDestroy
{
  private readonly connections = new Map<Socket, Connection>();
  private readonly authenticated = new WeakMap<Socket, TokenPayload>();
  private readonly frontendOrigin: string;
  private timer?: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(
    @Inject(FleetTicketsService) private readonly tickets: FleetTicketsService,
    @Inject(FleetEvents) private readonly events: FleetEvents,
    @Inject(ConfigService) config: ConfigService,
  ) {
    const production = config.get<string>('NODE_ENV') === 'production';
    const configured =
      config.get<string>('FRONTEND_URL') ??
      (production ? '' : 'http://localhost:3000');
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error('A valid FRONTEND_URL is required for fleet realtime');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      (production && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error(
        'FRONTEND_URL must be an origin and use HTTPS in production',
      );
    this.frontendOrigin = url.origin;
  }

  afterInit(namespace: Namespace): void {
    namespace.use((socket, next) => {
      void this.authenticate(socket).then(
        () => next(),
        () => next(new Error('Fleet connection denied')),
      );
    });
    this.timer = setInterval(() => {
      for (const [socket, connection] of this.connections) {
        if (connection.checking) continue;
        connection.checking = true;
        void this.tickets
          .validateActor(connection.actor)
          .catch(() => this.disconnect(socket))
          .finally(() => {
            connection.checking = false;
          });
      }
    }, 15_000);
    this.timer.unref();
  }

  async handleConnection(socket: Socket): Promise<void> {
    const actor = this.authenticated.get(socket);
    if (!actor || this.closed || this.connections.size >= 1_000)
      return this.disconnect(socket);
    let userCount = 0;
    for (const connection of this.connections.values()) {
      if (connection.actor.sub === actor.sub) userCount += 1;
    }
    if (userCount >= 5) return this.disconnect(socket);
    const connection: Connection = {
      actor,
      unsubscribe: () => {},
      pending: new Map(),
      flushing: false,
      checking: false,
      ready: false,
    };
    this.connections.set(socket, connection);
    try {
      await this.tickets.validateActor(actor);
      if (!this.isCurrent(socket, connection)) return;
      await socket.join(`fleet:company:${actor.orgId}`);
      await this.tickets.validateActor(actor);
      if (!this.isCurrent(socket, connection)) return;
      connection.unsubscribe = this.events.subscribe(actor.orgId, (event) =>
        this.enqueue(socket, connection, event),
      );
      connection.ready = true;
      socket.emit('fleet:ready', { companyId: actor.orgId });
    } catch {
      this.disconnect(socket);
    }
  }

  handleDisconnect(socket: Socket): void {
    const connection = this.connections.get(socket);
    connection?.unsubscribe();
    connection?.pending.clear();
    this.connections.delete(socket);
    this.authenticated.delete(socket);
  }

  onModuleDestroy(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const socket of this.connections.keys()) this.disconnect(socket);
  }

  private async authenticate(socket: Socket): Promise<void> {
    if (this.closed || socket.handshake.headers.origin !== this.frontendOrigin)
      throw new Error('Origin denied');
    const ticket: unknown = socket.handshake.auth?.ticket;
    const actor = await this.tickets.consume(ticket);
    if (this.closed) throw new Error('Fleet realtime is unavailable');
    this.authenticated.set(socket, actor);
  }

  private enqueue(
    socket: Socket,
    connection: Connection,
    event: FleetEvent,
  ): void {
    if (
      !this.isCurrent(socket, connection) ||
      event.data.companyId !== connection.actor.orgId
    )
      return;
    const key =
      event.name === 'fleet:headquarters-updated'
        ? event.name
        : `${event.name}:${event.data.driverId}`;
    if (!connection.pending.has(key) && connection.pending.size >= 128)
      return this.disconnect(socket);
    connection.pending.set(key, event);
    if (!connection.flushing) void this.flush(socket, connection);
  }

  private async flush(socket: Socket, connection: Connection): Promise<void> {
    connection.flushing = true;
    try {
      while (connection.pending.size && this.isCurrent(socket, connection)) {
        const first = connection.pending.entries().next().value;
        if (!first) break;
        const [key, event] = first;
        connection.pending.delete(key);
        await this.tickets.validateActor(connection.actor);
        if (connection.ready && this.isCurrent(socket, connection))
          socket.emit(event.name, event.data);
      }
    } catch {
      this.disconnect(socket);
    } finally {
      connection.flushing = false;
    }
  }

  private isCurrent(socket: Socket, connection: Connection): boolean {
    return (
      !this.closed &&
      socket.connected &&
      this.connections.get(socket) === connection
    );
  }

  private disconnect(socket: Socket): void {
    this.handleDisconnect(socket);
    socket.disconnect(true);
  }
}
