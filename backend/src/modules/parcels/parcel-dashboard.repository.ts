import { and, or, not } from '@prisma/orm-postgres/orm-client';
import { Inject, Injectable } from '@nestjs/common';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { amount, company } from './parcel-domain.js';
import { ParcelStore, dateRange, now, pattern, wire, RETURN_PARCEL_FIELDS } from './parcel-store.js';
import { shipmentFilter } from './parcel-filters.js';
import { DashboardQueryDto } from './parcel.dto.js';
@Injectable()
export class ParcelDashboardRepository {
  constructor(@Inject(ParcelStore) private readonly store: ParcelStore) {}
  async dashboard(
    actor: TokenPayload,
    q: DashboardQueryDto = new DashboardQueryDto(),
  ) {
    const companyId = company(actor),
      raw = this.store.prisma.db.raw,
      filter = shipmentFilter(companyId, q),
      dates = dateRange(q);
    const search = q.search ? pattern(q.search) : '';
    const scoped =
      raw.sql`SELECT s.* FROM shipments s WHERE s."companyId"=${companyId}
      AND (${q.merchantId ?? ''}='' OR s."merchantId"=${q.merchantId ?? ''})
      AND (${q.workerId ?? ''}='' OR s."workerId"=${q.workerId ?? ''})
      AND (${q.city ?? ''}='' OR s.city=${q.city ?? ''})
      AND (${q.status ?? ''}='' OR s.status=${q.status ?? ''})
      AND (${q.currency ?? ''}='' OR s.currency=${q.currency ?? ''})
      AND s."createdAt">=${dates.from?.toString() ?? '0001-01-01T00:00:00Z'}::timestamptz
      AND s."createdAt"<=${dates.to?.toString() ?? '9999-12-31T23:59:59Z'}::timestamptz
      AND (${search}='' OR s."trackingNumber" ILIKE ${search} OR s."recipientName" ILIKE ${search} OR s."recipientPhone" ILIKE ${search} OR s."merchantReference" ILIKE ${search} OR EXISTS(SELECT 1 FROM merchants m WHERE m.id=s."merchantId" AND m."companyId"=s."companyId" AND m."companyId"=${companyId} AND m.name ILIKE ${search}))
    `.returnsRow({ id: 'pg/text@1' });
    const [distribution, overdue, recent, attention, returns, totals] =
      await Promise.all([
        this.store.prisma.db
          .runtime()
          .query(
            raw.sql`WITH scoped AS (${scoped}) SELECT status,count(*)::int AS count FROM scoped GROUP BY status ORDER BY status`
              .returnsRow({ status: 'pg/text@1', count: 'pg/int4@1' })
              .build(),
          ),
        this.store.prisma.db
          .runtime()
          .query(
            raw.sql`WITH scoped AS (${scoped}) SELECT count(*)::int AS count FROM scoped WHERE "scheduledAt"<now() AND status NOT IN ('DELIVERED','CANCELLED','RETURNED','RETURNED_TO_MERCHANT')`
              .returnsRow({ count: 'pg/int4@1' })
              .build(),
          ),
        this.store.orm.ShipmentHistory.where((e) => e.shipment.some(filter))
          .orderBy([(e) => e.occurredAt.desc(), (e) => e.id.desc()])
          .limit(20)
          .all(),
        this.store.orm.Shipment.where(filter)
          .where((s) =>
            or(
              s.status.eq('FAILED_DELIVERY'),
              and(
                s.scheduledAt.lt(now()),
                not(
                  s.status.in([
                    'DELIVERED',
                    'CANCELLED',
                    'RETURNED',
                    'RETURNED_TO_MERCHANT',
                  ]),
                ),
              ),
            ),
          )
          .orderBy([(s) => s.updatedAt.desc(), (s) => s.id.desc()])
          .limit(20)
          .all(),
        this.store.orm.ParcelReturn.where({ companyId })
          .where((r) =>
            and(
              r.status.in(['RETURN_IN_PROGRESS', 'RETURNED_TO_WAREHOUSE']),
              r.shipment.some(filter),
            ),
          )
          .include('shipment', (s) => s.where({ companyId }).select(...RETURN_PARCEL_FIELDS))
          .orderBy([(r) => r.createdAt.desc(), (r) => r.id.desc()])
          .limit(20)
          .all(),
        this.store.prisma.db.runtime().query(
          raw.sql`
        WITH scoped AS (${scoped}), selected_ledger AS (
          SELECT e.* FROM merchant_ledger_entries e WHERE e."companyId"=${companyId} AND
          (EXISTS(SELECT 1 FROM scoped s WHERE s.id=e."shipmentId") OR
            (e."shipmentId" IS NULL AND ${!!(q.workerId || q.city || q.status || q.search)}=false
              AND (${q.merchantId ?? ''}='' OR e."merchantId"=${q.merchantId ?? ''})
              AND (${q.currency ?? ''}='' OR e.currency=${q.currency ?? ''})
              AND e."createdAt">=${dates.from?.toString() ?? '0001-01-01T00:00:00Z'}::timestamptz
              AND e."createdAt"<=${dates.to?.toString() ?? '9999-12-31T23:59:59Z'}::timestamptz))
        ), currencies AS (SELECT currency FROM scoped UNION SELECT currency FROM selected_ledger),
        shipment_totals AS (SELECT s.currency,
          COALESCE(sum(s."codMinor") FILTER (WHERE c.id IS NULL AND s.status NOT IN ('CANCELLED','RETURNED','RETURN_IN_PROGRESS','RETURNED_TO_WAREHOUSE','RETURNED_TO_MERCHANT')),0) AS expected,
          COALESCE(sum(s."codMinor") FILTER (WHERE c.id IS NULL AND s.status='DELIVERED'),0) AS uncollected
          FROM scoped s LEFT JOIN cod_collections c ON c."shipmentId"=s.id AND c."companyId"=s."companyId" GROUP BY s.currency),
        collection_totals AS (SELECT c.currency,sum(c."goodsMinor") AS collected,COALESCE(sum(c."amountMinor") FILTER (WHERE r.id IS NULL AND c.method='CASH'),0) AS unremitted
          FROM cod_collections c JOIN scoped s ON s.id=c."shipmentId" AND s."companyId"=c."companyId"
          LEFT JOIN cash_remittances r ON r."collectionId"=c.id AND r."companyId"=c."companyId" WHERE c."companyId"=${companyId} GROUP BY c.currency),
        ledger_totals AS (SELECT currency,sum("amountMinor") AS payable FROM selected_ledger GROUP BY currency),
        payment_totals AS (SELECT e.currency,sum(l."amountMinor") AS paid FROM merchant_settlement_lines l
          JOIN selected_ledger e ON e.id=l."ledgerEntryId" AND e."companyId"=l."companyId"
          JOIN settlement_payments p ON p."settlementId"=l."settlementId" AND p."companyId"=l."companyId"
          WHERE l."companyId"=${companyId} GROUP BY e.currency)
        SELECT c.currency,COALESCE(s.expected,0)::text AS expected,COALESCE(s.uncollected,0)::text AS uncollected,COALESCE(t.collected,0)::text AS collected,COALESCE(t.unremitted,0)::text AS unremitted,(COALESCE(l.payable,0)-COALESCE(p.paid,0))::text AS payable,COALESCE(p.paid,0)::text AS paid
        FROM currencies c LEFT JOIN shipment_totals s ON s.currency=c.currency LEFT JOIN collection_totals t ON t.currency=c.currency LEFT JOIN ledger_totals l ON l.currency=c.currency LEFT JOIN payment_totals p ON p.currency=c.currency ORDER BY c.currency
      `
            .returnsRow({
              currency: 'pg/text@1',
              expected: 'pg/text@1',
              uncollected: 'pg/text@1',
              collected: 'pg/text@1',
              unremitted: 'pg/text@1',
              payable: 'pg/text@1',
              paid: 'pg/text@1',
            })
            .build(),
        ),
      ]);
    const count = (...statuses: string[]) =>
      distribution
        .filter((s) => statuses.includes(s.status))
        .reduce((sum, s) => sum + s.count, 0);
    return {
      companyId,
      counts: {
        total: distribution.reduce((sum, s) => sum + s.count, 0),
        new: count('CREATED'),
        atWarehouse: count('AT_WAREHOUSE'),
        assigned: count('ASSIGNED'),
        outForDelivery: count('OUT_FOR_DELIVERY'),
        delivered: count('DELIVERED'),
        failedDeliveries: count('FAILED_DELIVERY'),
        pendingReturns: count('RETURN_IN_PROGRESS', 'RETURNED_TO_WAREHOUSE'),
        returnedToMerchant: count('RETURNED_TO_MERCHANT'),
        overdue: overdue[0]?.count ?? 0,
      },
      statusDistribution: distribution,
      recentActivity: recent,
      attention: attention.map(wire),
      pendingReturns: returns.map(({ shipment, ...row }) => ({
        ...row,
        parcel: shipment ? wire(shipment) : null,
      })),
      money: totals.map((row) => ({
        currency: row.currency,
        expectedCod: amount(BigInt(row.expected), row.currency),
        uncollectedCod: amount(BigInt(row.uncollected), row.currency),
        collectedCod: amount(BigInt(row.collected), row.currency),
        unremittedCash: amount(BigInt(row.unremitted), row.currency),
        merchantPayables: amount(BigInt(row.payable), row.currency),
        settledAmounts: amount(BigInt(row.paid), row.currency),
      })),
    };
  }
}
