import { describe, expect, it } from 'vitest';
import {
  requireCollectionMode,
  requireCoordinates,
  requireUnreceived,
  requireWindow,
} from './merchant-portal.domain.js';
describe('merchant parcel and pickup invariants', () => {
  it('distinguishes zero prepaid parcels from positive COD without manufacturing payments', () => {
    expect(() => requireCollectionMode(0n, 'PREPAID')).not.toThrow();
    expect(() => requireCollectionMode(15000n, 'COD')).not.toThrow();
    expect(() => requireCollectionMode(0n, 'COD')).toThrow();
    expect(() => requireCollectionMode(1n, 'PREPAID')).toThrow();
  });
  it('does not confuse parcel creation with physical receipt', () => {
    expect(() =>
      requireUnreceived({ status: 'CREATED', custody: 'MERCHANT' }),
    ).not.toThrow();
    for (const parcel of [
      { status: 'CREATED', custody: 'COMPANY' },
      { status: 'DELIVERED', custody: 'CUSTOMER' },
    ])
      expect(() => requireUnreceived(parcel)).toThrow(/approval/);
  });
  it('requires complete, ordered pickup preferences and paired coordinates', () => {
    expect(() => requireWindow()).not.toThrow();
    expect(() =>
      requireWindow('2026-10-23T08:00:00Z', '2026-10-23T10:00:00Z', true),
    ).not.toThrow();
    expect(() => requireWindow(undefined, undefined, true)).toThrow();
    expect(() =>
      requireWindow('2026-10-23T10:00:00Z', '2026-10-23T08:00:00Z'),
    ).toThrow();
    expect(() => requireCoordinates(31.9)).toThrow();
    expect(() => requireCoordinates(31.9, 35.2)).not.toThrow();
  });
});
