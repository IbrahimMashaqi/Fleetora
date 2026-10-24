import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FleetEvent } from './fleet.types.js';

type Listener = (event: FleetEvent) => void;

/** In-process delivery only. Multi-instance deployment needs a shared event adapter. */
@Injectable()
export class FleetEvents implements OnModuleDestroy {
  private readonly listeners = new Map<string, Set<Listener>>();
  private count = 0;
  private closed = false;

  subscribe(companyId: string, listener: Listener): () => void {
    if (!companyId || this.closed || this.count >= 1_000) {
      throw new ServiceUnavailableException('Fleet realtime is unavailable');
    }
    const listeners = this.listeners.get(companyId) ?? new Set<Listener>();
    // Every registration owns its own unsubscribe, even for the same callback.
    const registered: Listener = (event) => listener(event);
    listeners.add(registered);
    this.listeners.set(companyId, listeners);
    this.count += 1;
    return () => {
      if (!listeners.delete(registered)) return;
      this.count -= 1;
      if (listeners.size === 0) this.listeners.delete(companyId);
    };
  }

  publish(event: FleetEvent): void {
    for (const listener of this.listeners.get(event.data.companyId) ?? []) {
      // A failing transport must not turn a committed write into an HTTP failure.
      try {
        listener(event);
      } catch {
        // Subscribers manage their own disconnect and cleanup.
      }
    }
  }

  onModuleDestroy(): void {
    this.closed = true;
    for (const listeners of this.listeners.values()) listeners.clear();
    this.listeners.clear();
    this.count = 0;
  }
}
