import { describe, expect, it } from 'vitest';
import {
  money,
  amount,
  assertTransition,
  collectionTotal,
  capabilities,
  assertFullAmount,
  settlementTotals,
} from './parcel-domain.js';
import { instant, dateRange } from './parcel-store.js';
describe('parcel financial and lifecycle invariants', () => {
  it('normalizes inclusive date-only bounds at PostgreSQL microsecond precision and rejects reversed/invalid dates', () => {
    expect(instant('2026-10-21').toString()).toBe('2026-10-21T00:00:00Z');
    expect(instant('2026-10-21', true).toString()).toBe(
      '2026-10-21T23:59:59.999999Z',
    );
    expect(() => dateRange({ from: '2026-10-22', to: '2026-10-21' })).toThrow();
    expect(() => instant('2026-02-30')).toThrow();
  });
  it('keeps exact decimal arithmetic including three-digit currencies', () => {
    expect(money('900719925474.99', 'ILS')).toBe(90071992547499n);
    expect(amount(money('0.001', 'JOD'), 'JOD')).toBe('0.001');
    expect(() => money('0.001', 'ILS')).toThrow();
    expect(() => money('1e3', 'ILS')).toThrow();
    expect(() => money('-1', 'ILS')).toThrow();
  });
  it('separates merchant goods from customer-paid company charges', () => {
    expect(collectionTotal(10000n, 1000n, 200n, 'MERCHANT')).toBe(10000n);
    expect(collectionTotal(10000n, 1000n, 200n, 'CUSTOMER')).toBe(11200n);
    expect(collectionTotal(15000n, 1500n, 0n, 'MERCHANT', 'FINAL_INCLUSIVE')).toBe(15000n);
    expect(collectionTotal(15000n, 1500n, 0n, 'CUSTOMER', 'FINAL_INCLUSIVE')).toBe(15000n);
    expect(collectionTotal(0n, 1500n, 0n, 'MERCHANT', 'FINAL_INCLUSIVE')).toBe(0n);
    expect(
      settlementTotals([
        { kind: 'GOODS', amountMinor: 10000n },
        { kind: 'DELIVERY_FEE', amountMinor: -1000n },
        { kind: 'RETURN_FEE', amountMinor: -200n },
        { kind: 'ADJUSTMENT', amountMinor: 50n },
      ]),
    ).toEqual({
      grossCollected: 10000n,
      deliveryFees: 1000n,
      returnFees: 200n,
      adjustments: 50n,
      netPayable: 8850n,
    });
  });
  it('rejects partial collection/remittance/payment and invalid terminal transitions', () => {
    expect(() => assertFullAmount(9n, 10n)).toThrow();
    expect(() => assertTransition('DELIVERED', 'RETURN_IN_PROGRESS')).toThrow();
    expect(() =>
      assertTransition('RETURNED_TO_MERCHANT', 'DELIVERED'),
    ).toThrow();
    expect(() => assertTransition('CREATED', 'DELIVERED')).toThrow();
    expect(() =>
      assertTransition('OUT_FOR_DELIVERY', 'DELIVERED'),
    ).not.toThrow();
  });
  it('grants accountants financial work but never operations or approval', () => {
    expect(capabilities('ACCOUNTANT')).toMatchObject({
      view: true,
      manageParcels: false,
      manageMerchants: false,
      manageReturns: false,
      collect: true,
      remit: true,
      approveSettlements: false,
      paySettlements: true,
    });
    expect(capabilities('MERCHANT').view).toBe(false);
    expect(capabilities('PLATFORM_ADMIN').view).toBe(false);
  });
});
