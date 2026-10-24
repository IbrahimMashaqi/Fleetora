export interface FinalInclusiveInput {
  finalCustomerAmountMinor: bigint;
  baseFeeMinor: bigint;
  discountMinor: bigint;
  promotionDiscountMinor: bigint;
}

/** No customer money is added to the final payable amount, including prepaid orders. */
export function calculateFinalInclusive(input: Readonly<FinalInclusiveInput>) {
  const {
    finalCustomerAmountMinor,
    baseFeeMinor,
    discountMinor,
    promotionDiscountMinor,
  } = input;
  if (
    finalCustomerAmountMinor < 0n ||
    baseFeeMinor < 0n ||
    discountMinor < 0n ||
    promotionDiscountMinor < 0n
  )
    throw new RangeError('Pricing amounts must be nonnegative');
  if (discountMinor + promotionDiscountMinor > baseFeeMinor)
    throw new RangeError('Configured discounts exceed the contractual fee');
  const deliveryFeeMinor =
    baseFeeMinor - discountMinor - promotionDiscountMinor;
  return Object.freeze({
    finalCustomerAmountMinor,
    deliveryFeeMinor,
    expectedMerchantProceedsMinor: finalCustomerAmountMinor - deliveryFeeMinor,
  });
}
