import { describe, expect, it } from 'vitest';
import { calculateFinalInclusive } from './pricing-engine.js';

describe('final-inclusive contractual pricing', () => {
  const input = {
    finalCustomerAmountMinor: 15000n,
    baseFeeMinor: 1500n,
    discountMinor: 0n,
    promotionDiscountMinor: 0n,
  };
  it('collects the final 150 and retains 15 rather than adding delivery again', () => {
    expect(calculateFinalInclusive(input)).toEqual({
      finalCustomerAmountMinor: 15000n,
      deliveryFeeMinor: 1500n,
      expectedMerchantProceedsMinor: 13500n,
    });
  });
  it('keeps the contractual delivery charge when no customer cash is due', () => {
    expect(
      calculateFinalInclusive({ ...input, finalCustomerAmountMinor: 0n }),
    ).toEqual({
      finalCustomerAmountMinor: 0n,
      deliveryFeeMinor: 1500n,
      expectedMerchantProceedsMinor: -1500n,
    });
  });
  it('applies only explicitly supplied contractual and promotion discounts', () => {
    expect(
      calculateFinalInclusive({
        ...input,
        discountMinor: 100n,
        promotionDiscountMinor: 200n,
      }).deliveryFeeMinor,
    ).toBe(1200n);
  });
  it('retains exact precision beyond JavaScript safe integers', () => {
    expect(
      calculateFinalInclusive({
        ...input,
        finalCustomerAmountMinor: 9999999999999999n,
      }).expectedMerchantProceedsMinor,
    ).toBe(9999999999998499n);
  });
  it.each([
    { finalCustomerAmountMinor: -1n },
    { baseFeeMinor: -1n },
    { discountMinor: -1n },
    { promotionDiscountMinor: -1n },
    { discountMinor: 1000n, promotionDiscountMinor: 501n },
  ])(
    'rejects invalid amounts instead of inventing or clamping fees',
    (change) => {
      expect(() => calculateFinalInclusive({ ...input, ...change })).toThrow(
        RangeError,
      );
    },
  );
});
