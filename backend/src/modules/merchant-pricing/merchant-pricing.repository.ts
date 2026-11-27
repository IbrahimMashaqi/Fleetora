import { Inject, Injectable } from '@nestjs/common';
import type { TokenPayload } from '../auth/token/token.payload.js';
import {
  ParcelStore,
  type ParcelOrm,
  type ParcelTransaction,
} from '../parcels/parcel-store.js';
import type { PricingPageDto } from './merchant-pricing.dto.js';
import { normalizeLookupSearch } from '../parcels/lookup-search.js';

export type PricingZone = NonNullable<
  Awaited<ReturnType<ParcelOrm['DeliveryZone']['first']>>
>;
export type PricingPlan = NonNullable<
  Awaited<ReturnType<ParcelOrm['MerchantPlan']['first']>>
>;
export type PricingTariff = NonNullable<
  Awaited<ReturnType<ParcelOrm['PlanZoneTariff']['first']>>
>;
type ZoneData = Pick<
  PricingZone,
  'name' | 'city' | 'baseFeeMinor' | 'currency' | 'active'
>;
type PlanData = Pick<PricingPlan, 'name' | 'currency' | 'active'>;
type TariffData = Pick<
  PricingTariff,
  'feeMinor' | 'discountMinor' | 'promotionDiscountMinor' | 'promotionLabel'
>;

@Injectable()
export class MerchantPricingRepository {
  constructor(@Inject(ParcelStore) private readonly store: ParcelStore) {}

  /** Pricing mutations and parcel confirmation serialize on the same company lock. */
  write<T>(
    actor: TokenPayload,
    operation: (tx: ParcelTransaction, companyId: string) => Promise<T>,
  ) {
    return this.store.write(actor, 'manageMerchants', operation);
  }
  async readQuote<T>(
    operation: (tx: ParcelTransaction) => Promise<T>,
  ): Promise<T> {
    return this.store.prisma.db.transaction(operation);
  }
  async lockCompany(tx: ParcelTransaction, companyId: string) {
    await tx.execute(
      this.store.prisma.db.raw
        .sql`SELECT "id" FROM "companies" WHERE "id"=${companyId} FOR UPDATE`
        .affectedCount()
        .build(),
    );
  }
  merchant(tx: ParcelTransaction, companyId: string, id: string) {
    return tx.orm.public.Merchant.where({ companyId, id }).first();
  }
  zone(tx: ParcelTransaction, companyId: string, id: string) {
    return tx.orm.public.DeliveryZone.where({ companyId, id }).first();
  }
  plan(tx: ParcelTransaction, companyId: string, id: string) {
    return tx.orm.public.MerchantPlan.where({ companyId, id }).first();
  }
  tariff(
    tx: ParcelTransaction,
    companyId: string,
    planId: string,
    zoneId: string,
  ) {
    return tx.orm.public.PlanZoneTariff.where({
      companyId,
      planId,
      zoneId,
    }).first();
  }
  async searchIds(tx: ParcelTransaction, companyId: string, kind: 'zones' | 'plans', search: string) {
    const term = normalizeLookupSearch(search), limit = term ? 20 : 10;
    const rows = await tx.query(this.store.prisma.db.raw.sql`
      SELECT id FROM (
        SELECT id, name, city AS detail FROM delivery_zones WHERE ${kind}='zones' AND "companyId"=${companyId} AND active=true
        UNION ALL
        SELECT id, name, '' AS detail FROM merchant_plans WHERE ${kind}='plans' AND "companyId"=${companyId} AND active=true
      ) choices WHERE strpos(lower(translate(regexp_replace(name || ' ' || detail, '[ؐ-ًؚ-ٰٟۖ-ۭـ]', '', 'g'), 'أإآةى', 'اااهي')), ${term})>0
      ORDER BY name, id LIMIT ${limit}
    `.returnsRow({ id: 'pg/text@1' }).build());
    return rows.map(row => row.id);
  }
  async zones(tx: ParcelTransaction, companyId: string, q: PricingPageDto) {
    let query = tx.orm.public.DeliveryZone.where({ companyId });
    if (q.search !== undefined) {
      const ids = await this.searchIds(tx, companyId, 'zones', q.search);
      if (!ids.length) return [];
      query = query.where(r => r.id.in(ids));
    }
    return query
      .orderBy([(r) => r.city.asc(), (r) => r.name.asc(), (r) => r.id.asc()])
      .offset((q.page - 1) * q.pageSize)
      .limit(q.pageSize + 1)
      .all();
  }
  async plans(tx: ParcelTransaction, companyId: string, q: PricingPageDto) {
    let query = tx.orm.public.MerchantPlan.where({ companyId });
    if (q.search !== undefined) {
      const ids = await this.searchIds(tx, companyId, 'plans', q.search);
      if (!ids.length) return [];
      query = query.where(r => r.id.in(ids));
    }
    return query
      .orderBy([(r) => r.name.asc(), (r) => r.id.asc()])
      .offset((q.page - 1) * q.pageSize)
      .limit(q.pageSize + 1)
      .all();
  }
  tariffs(tx: ParcelTransaction, companyId: string, planId: string) {
    return tx.orm.public.PlanZoneTariff.where({ companyId, planId })
      .include('zone', (zone) =>
        zone.where({ companyId }).select('name', 'city'),
      )
      .orderBy((r) => r.zoneId.asc())
      .all();
  }
  createZone(tx: ParcelTransaction, companyId: string, data: ZoneData) {
    return tx.orm.public.DeliveryZone.create({ companyId, ...data });
  }
  async updateZone(
    tx: ParcelTransaction,
    companyId: string,
    id: string,
    revision: number,
    data: ZoneData,
  ) {
    await tx.orm.public.DeliveryZone.where({ companyId, id, revision }).update({
      ...data,
      revision: revision + 1,
    });
    return this.zone(tx, companyId, id);
  }
  createPlan(tx: ParcelTransaction, companyId: string, data: PlanData) {
    return tx.orm.public.MerchantPlan.create({ companyId, ...data });
  }
  async updatePlan(
    tx: ParcelTransaction,
    companyId: string,
    id: string,
    revision: number,
    data: PlanData,
  ) {
    await tx.orm.public.MerchantPlan.where({ companyId, id, revision }).update({
      ...data,
      revision: revision + 1,
    });
    return this.plan(tx, companyId, id);
  }
  async saveTariff(
    tx: ParcelTransaction,
    companyId: string,
    planId: string,
    zoneId: string,
    data: TariffData,
    exists: boolean,
    planRevision: number,
  ) {
    if (exists)
      await tx.orm.public.PlanZoneTariff.where({
        companyId,
        planId,
        zoneId,
      }).update(data);
    else
      await tx.orm.public.PlanZoneTariff.create({
        companyId,
        planId,
        zoneId,
        ...data,
      });
    await tx.orm.public.MerchantPlan.where({
      companyId,
      id: planId,
      revision: planRevision,
    }).update({ revision: planRevision + 1 });
    return this.tariff(tx, companyId, planId, zoneId);
  }
  async assignPlan(
    tx: ParcelTransaction,
    companyId: string,
    merchantId: string,
    planId: string,
    pricingDiscountMinor: bigint,
    revision: number,
  ) {
    await tx.orm.public.Merchant.where({
      companyId,
      id: merchantId,
      revision,
    }).update({ planId, pricingDiscountMinor, revision: revision + 1 });
    return this.merchant(tx, companyId, merchantId);
  }
}
