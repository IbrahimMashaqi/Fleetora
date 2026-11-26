import { NotFoundException } from '@nestjs/common';
import { amount } from '../parcels/parcel-domain.js';
import type { MerchantTransaction } from './merchant-access.repository.js';

/**
 * OD-13 (BR-002, BR-093), owner decision Q11: the agreement a merchant OWNER accepts is a
 * snapshot of the merchant's current commercial terms. Versioned tariffs come in Phase 4.
 */
export type MerchantAgreementTerms = {
  merchantRevision: number;
  currency: string;
  plan: { id: string; name: string; revision: number } | null;
  deliveryFee: string;
  returnFee: string;
  serviceFee: string;
  pricingDiscount: string;
  feePayer: string;
  returnFeePolicy: string;
};

export async function merchantAgreementTerms(
  tx: MerchantTransaction,
  merchantId: string,
  companyId: string,
): Promise<MerchantAgreementTerms> {
  const merchant = await tx.orm.public.Merchant.where({
    id: merchantId,
    companyId,
  }).first();
  if (!merchant) throw new NotFoundException('Merchant not found');
  const plan = merchant.planId
    ? await tx.orm.public.MerchantPlan.where({
        id: merchant.planId,
        companyId,
      })
        .select('id', 'name', 'revision')
        .first()
    : null;
  return {
    merchantRevision: merchant.revision,
    currency: merchant.currency,
    plan: plan ? { id: plan.id, name: plan.name, revision: plan.revision } : null,
    deliveryFee: amount(merchant.deliveryFeeMinor, merchant.currency),
    returnFee: amount(merchant.returnFeeMinor, merchant.currency),
    serviceFee: amount(merchant.serviceFeeMinor, merchant.currency),
    pricingDiscount: amount(merchant.pricingDiscountMinor, merchant.currency),
    feePayer: merchant.feePayer,
    returnFeePolicy: merchant.returnFeePolicy,
  };
}
