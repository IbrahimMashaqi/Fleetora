import { describe, expect, it, vi } from 'vitest';
import { FleetEvents } from './fleet-events.js';
import type { FleetEvent } from './fleet.types.js';

const event: FleetEvent = {
  name: 'fleet:driver-status-changed',
  data: {
    companyId: 'company-a',
    driverId: 'driver-a',
    serverTime: '2026-10-17T10:00:00Z',
    tracking: {
      revision: 1,
      sharing: false,
      sharingStartedAt: null,
      location: null,
    },
  },
};

describe('FleetEvents', () => {
  it('publishes exclusively to the company subscription and supports idempotent cleanup', () => {
    const bus = new FleetEvents();
    const own = vi.fn();
    const other = vi.fn();
    const unsubscribe = bus.subscribe('company-a', own);
    bus.subscribe('company-b', other);
    bus.publish(event);
    expect(own).toHaveBeenCalledWith(event);
    expect(other).not.toHaveBeenCalled();
    unsubscribe();
    unsubscribe();
    bus.publish(event);
    expect(own).toHaveBeenCalledTimes(1);
    bus.onModuleDestroy();
    bus.publish({ ...event, data: { ...event.data, companyId: 'company-b' } });
    expect(other).not.toHaveBeenCalled();
    expect(() => bus.subscribe('company-a', own)).toThrow();
  });

  it('bounds subscribers, releases capacity, and isolates listener failures', () => {
    const bus = new FleetEvents();
    const cleanups = Array.from({ length: 1_000 }, () =>
      bus.subscribe('company-a', () => {
        throw new Error('transport failed');
      }),
    );
    expect(() => bus.subscribe('company-b', vi.fn())).toThrow();
    cleanups[0]();
    const healthy = vi.fn();
    bus.subscribe('company-a', healthy);
    expect(() => bus.publish(event)).not.toThrow();
    expect(healthy).toHaveBeenCalledWith(event);
    bus.onModuleDestroy();
    cleanups[1]();
  });
});
