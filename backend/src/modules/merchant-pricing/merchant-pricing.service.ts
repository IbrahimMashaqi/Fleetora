import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { amount, assertRevision, money } from '../parcels/parcel-domain.js';
import type { ParcelTransaction } from '../parcels/parcel-store.js';
import type {
  AssignMerchantPlanDto,
  PlanEditDto,
  PlanInputDto,
  PricingPageDto,
  PricingPreviewDto,
  TariffInputDto,
  ZoneEditDto,
  ZoneInputDto,
} from './merchant-pricing.dto.js';
import {
  MerchantPricingRepository,
  type PricingTariff,
  type PricingZone,
} from './merchant-pricing.repository.js';
import { calculateFinalInclusive } from './pricing-engine.js';

export interface PricingSnapshot {
  pricingMode: 'FINAL_INCLUSIVE';
  deliveryZoneId: string;
  pricingPlanId: string;
  pricingPlanVersion: string;
  baseDeliveryFeeMinor: bigint;
  discountMinor: bigint;
  promotionDiscountMinor: bigint;
  deliveryFeeMinor: bigint;
  codMinor: bigint;
  currency: string;
  feePayer: 'MERCHANT';
  serviceFeeMinor: bigint;
}

export interface PricingQuote {
  snapshot: Readonly<PricingSnapshot>;
  preview: {
    deliveryZoneId: string;
    zoneName: string;
    city: string;
    pricingPlanId: string;
    planName: string;
    pricingVersion: string;
    currency: string;
    finalCustomerAmount: string;
    baseDeliveryFee: string;
    discount: string;
    promotionDiscount: string;
    promotionLabel: string | null;
    deliveryFee: string;
    expectedMerchantProceeds: string;
    feePayer: 'MERCHANT';
  };
}

function configuredPrice(input: Parameters<typeof calculateFinalInclusive>[0]) {
  try {
    return calculateFinalInclusive(input);
  } catch (error: unknown) {
    if (error instanceof RangeError)
      throw new BadRequestException(error.message);
    throw error;
  }
}
function zoneWire(row: PricingZone) {
  const { baseFeeMinor, ...rest } = row;
  return { ...rest, baseFee: amount(baseFeeMinor, row.currency) };
}
function tariffWire(row: PricingTariff, currency: string) {
  const { feeMinor, discountMinor, promotionDiscountMinor, ...rest } = row;
  return {
    ...rest,
    fee: amount(feeMinor, currency),
    discount: amount(discountMinor, currency),
    promotionDiscount: amount(promotionDiscountMinor, currency),
  };
}
function pricingPage<T>(companyId: string, rows: T[], query: PricingPageDto) {
  return {
    companyId,
    items: rows.slice(0, query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    hasNext: rows.length > query.pageSize,
  };
}

@Injectable()
export class MerchantPricingService {
  constructor(
    @Inject(MerchantPricingRepository)
    private readonly repository: MerchantPricingRepository,
  ) {}

  private admin(actor: TokenPayload) {
    if (!actor?.sub) throw new UnauthorizedException();
    if (actor.role !== 'COMPANY_ADMIN' || !actor.orgId?.trim())
      throw new ForbiddenException('Company administrator access required');
  }
  private async zone(tx: ParcelTransaction, companyId: string, id: string) {
    const zone = await this.repository.zone(tx, companyId, id);
    if (!zone || zone.companyId !== companyId)
      throw new NotFoundException('Delivery zone not found');
    return zone;
  }
  private async plan(tx: ParcelTransaction, companyId: string, id: string) {
    const plan = await this.repository.plan(tx, companyId, id);
    if (!plan || plan.companyId !== companyId)
      throw new NotFoundException('Merchant plan not found');
    return plan;
  }
  private async merchant(tx: ParcelTransaction, companyId: string, id: string) {
    const merchant = await this.repository.merchant(tx, companyId, id);
    if (!merchant || merchant.companyId !== companyId)
      throw new NotFoundException('Merchant not found');
    return merchant;
  }

  /** Internal boundary: companyId and merchantId must come from authorized server context.
   * Pass the parcel transaction to hold the pricing lock through snapshot persistence.
   */
  async quote(
    companyId: string,
    merchantId: string,
    zoneId: string,
    finalCustomerAmount: string,
    tx?: ParcelTransaction,
  ): Promise<PricingQuote> {
    if (!companyId?.trim())
      throw new ForbiddenException('Trusted company context required');
    if (!tx)
      return this.repository.readQuote((transaction) =>
        this.quote(
          companyId,
          merchantId,
          zoneId,
          finalCustomerAmount,
          transaction,
        ),
      );
    await this.repository.lockCompany(tx, companyId);
    const merchant = await this.merchant(tx, companyId, merchantId);
    if (!merchant.active || !merchant.planId)
      throw new BadRequestException(
        'An active merchant with a commercial plan is required',
      );
    const zone = await this.zone(tx, companyId, zoneId);
    const plan = await this.plan(tx, companyId, merchant.planId);
    if (!zone.active || !plan.active)
      throw new BadRequestException(
        'An active delivery zone and commercial plan are required',
      );
    if (zone.currency !== plan.currency || merchant.currency !== plan.currency)
      throw new BadRequestException(
        'Merchant, plan and delivery zone currencies must match',
      );
    const tariff = await this.repository.tariff(
      tx,
      companyId,
      plan.id,
      zone.id,
    );
    if (
      tariff &&
      (tariff.companyId !== companyId ||
        tariff.planId !== plan.id ||
        tariff.zoneId !== zone.id)
    )
      throw new NotFoundException('Zone tariff not found');
    const baseFeeMinor = tariff?.feeMinor ?? zone.baseFeeMinor;
    const discountMinor =
      (tariff?.discountMinor ?? 0n) + merchant.pricingDiscountMinor;
    const promotionDiscountMinor = tariff?.promotionDiscountMinor ?? 0n;
    const priced = configuredPrice({
      finalCustomerAmountMinor: money(finalCustomerAmount, plan.currency),
      baseFeeMinor,
      discountMinor,
      promotionDiscountMinor,
    });
    const pricingPlanVersion = createHash('sha256')
      .update(
        JSON.stringify({
          companyId,
          merchantId,
          zoneId,
          planId: plan.id,
          merchantRevision: merchant.revision,
          zoneRevision: zone.revision,
          planRevision: plan.revision,
          currency: plan.currency,
          baseFee: baseFeeMinor.toString(),
          discount: discountMinor.toString(),
          promotionDiscount: promotionDiscountMinor.toString(),
          promotionLabel: tariff?.promotionLabel ?? null,
          finalCustomerAmount: priced.finalCustomerAmountMinor.toString(),
        }),
      )
      .digest('hex');
    const snapshot: Readonly<PricingSnapshot> = Object.freeze({
      pricingMode: 'FINAL_INCLUSIVE',
      deliveryZoneId: zone.id,
      pricingPlanId: plan.id,
      pricingPlanVersion,
      baseDeliveryFeeMinor: baseFeeMinor,
      discountMinor,
      promotionDiscountMinor,
      deliveryFeeMinor: priced.deliveryFeeMinor,
      codMinor: priced.finalCustomerAmountMinor,
      currency: plan.currency,
      feePayer: 'MERCHANT',
      serviceFeeMinor: 0n,
    });
    return {
      snapshot,
      preview: {
        deliveryZoneId: zone.id,
        zoneName: zone.name,
        city: zone.city,
        pricingPlanId: plan.id,
        planName: plan.name,
        pricingVersion: pricingPlanVersion,
        currency: plan.currency,
        finalCustomerAmount: amount(
          priced.finalCustomerAmountMinor,
          plan.currency,
        ),
        baseDeliveryFee: amount(baseFeeMinor, plan.currency),
        discount: amount(discountMinor, plan.currency),
        promotionDiscount: amount(promotionDiscountMinor, plan.currency),
        promotionLabel: tariff?.promotionLabel ?? null,
        deliveryFee: amount(priced.deliveryFeeMinor, plan.currency),
        expectedMerchantProceeds: amount(
          priced.expectedMerchantProceedsMinor,
          plan.currency,
        ),
        feePayer: 'MERCHANT' as const,
      },
    };
  }

  preview(actor: TokenPayload, input: PricingPreviewDto) {
    this.admin(actor);
    return this.repository.write(actor, (tx, companyId) =>
      this.quote(
        companyId,
        input.merchantId,
        input.zoneId,
        input.finalCustomerAmount,
        tx,
      ).then((result) => result.preview),
    );
  }
  zones(actor: TokenPayload, query: PricingPageDto) {
    this.admin(actor);
    return this.repository.write(actor, async (tx, companyId) =>
      pricingPage(
        companyId,
        (await this.repository.zones(tx, companyId, query)).map(zoneWire),
        query,
      ),
    );
  }
  plans(actor: TokenPayload, query: PricingPageDto) {
    this.admin(actor);
    return this.repository.write(actor, async (tx, companyId) =>
      pricingPage(
        companyId,
        await this.repository.plans(tx, companyId, query),
        query,
      ),
    );
  }
  planDetails(actor: TokenPayload, id: string) {
    this.admin(actor);
    return this.repository.write(actor, async (tx, companyId) => {
      const plan = await this.plan(tx, companyId, id);
      return {
        companyId,
        plan,
        tariffs: (await this.repository.tariffs(tx, companyId, id)).map(
          (row) => ({
            ...tariffWire(row, plan.currency),
            zoneName: row.zone?.name ?? null,
            city: row.zone?.city ?? null,
          }),
        ),
      };
    });
  }
  saveZone(
    actor: TokenPayload,
    input: ZoneInputDto | ZoneEditDto,
    id?: string,
  ) {
    this.admin(actor);
    return this.repository.write(actor, async (tx, companyId) => {
      const data = {
        name: input.name,
        city: input.city,
        currency: input.currency,
        active: input.active ?? true,
        baseFeeMinor: money(input.baseFee, input.currency),
      };
      if (!id)
        return {
          companyId,
          zone: zoneWire(await this.repository.createZone(tx, companyId, data)),
        };
      const old = await this.zone(tx, companyId, id);
      if (!('revision' in input))
        throw new BadRequestException('Revision required');
      assertRevision(old.revision, input.revision);
      if (old.currency !== data.currency)
        throw new BadRequestException(
          'Create a new zone to use a different currency',
        );
      const updated = await this.repository.updateZone(
        tx,
        companyId,
        id,
        old.revision,
        data,
      );
      if (!updated) throw new NotFoundException('Delivery zone not found');
      return { companyId, zone: zoneWire(updated) };
    });
  }
  savePlan(
    actor: TokenPayload,
    input: PlanInputDto | PlanEditDto,
    id?: string,
  ) {
    this.admin(actor);
    return this.repository.write(actor, async (tx, companyId) => {
      const data = {
        name: input.name,
        currency: input.currency,
        active: input.active ?? true,
      };
      if (!id)
        return {
          companyId,
          plan: await this.repository.createPlan(tx, companyId, data),
        };
      const old = await this.plan(tx, companyId, id);
      if (!('revision' in input))
        throw new BadRequestException('Revision required');
      assertRevision(old.revision, input.revision);
      if (old.currency !== data.currency)
        throw new BadRequestException(
          'Create a new plan to use a different currency',
        );
      return {
        companyId,
        plan: await this.repository.updatePlan(
          tx,
          companyId,
          id,
          old.revision,
          data,
        ),
      };
    });
  }
  saveTariff(
    actor: TokenPayload,
    planId: string,
    zoneId: string,
    input: TariffInputDto,
  ) {
    this.admin(actor);
    return this.repository.write(actor, async (tx, companyId) => {
      const plan = await this.plan(tx, companyId, planId);
      const zone = await this.zone(tx, companyId, zoneId);
      assertRevision(plan.revision, input.revision);
      if (plan.currency !== zone.currency)
        throw new BadRequestException(
          'Plan and delivery zone currencies must match',
        );
      const data = {
        feeMinor: money(input.fee, plan.currency),
        discountMinor: money(input.discount, plan.currency),
        promotionDiscountMinor: money(input.promotionDiscount, plan.currency),
        promotionLabel: input.promotionLabel ?? null,
      };
      configuredPrice({
        finalCustomerAmountMinor: 0n,
        baseFeeMinor: data.feeMinor,
        discountMinor: data.discountMinor,
        promotionDiscountMinor: data.promotionDiscountMinor,
      });
      if (data.promotionDiscountMinor > 0n && !data.promotionLabel?.trim())
        throw new BadRequestException(
          'A configured promotion label is required',
        );
      const existing = await this.repository.tariff(
        tx,
        companyId,
        planId,
        zoneId,
      );
      const tariff = await this.repository.saveTariff(
        tx,
        companyId,
        planId,
        zoneId,
        data,
        !!existing,
        plan.revision,
      );
      if (!tariff) throw new NotFoundException('Zone tariff not found');
      return {
        companyId,
        planId,
        revision: plan.revision + 1,
        tariff: tariffWire(tariff, plan.currency),
      };
    });
  }
  assignPlan(
    actor: TokenPayload,
    merchantId: string,
    input: AssignMerchantPlanDto,
  ) {
    this.admin(actor);
    return this.repository.write(actor, async (tx, companyId) => {
      const merchant = await this.merchant(tx, companyId, merchantId);
      const plan = await this.plan(tx, companyId, input.planId);
      assertRevision(merchant.revision, input.revision);
      if (!plan.active)
        throw new BadRequestException('An active commercial plan is required');
      if (plan.currency !== merchant.currency)
        throw new BadRequestException(
          'Merchant and plan currencies must match',
        );
      const discountMinor = money(input.discountAmount, plan.currency);
      const updated = await this.repository.assignPlan(
        tx,
        companyId,
        merchantId,
        plan.id,
        discountMinor,
        merchant.revision,
      );
      if (!updated) throw new NotFoundException('Merchant not found');
      return {
        companyId,
        merchantId,
        planId: plan.id,
        discountAmount: amount(discountMinor, plan.currency),
        revision: updated.revision,
      };
    });
  }
}
