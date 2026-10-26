import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { amount, company } from './parcel-domain.js';
import type { OverviewResponse } from './overview.types.js';

@Injectable()
export class OverviewRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getOverview(actor: TokenPayload): Promise<OverviewResponse> {
    const companyId = company(actor, 'viewFinance');
    const generatedAt = new Date().toISOString();
    const today = generatedAt.slice(0, 10);
    const firstDay = new Date(`${today}T00:00:00Z`);
    firstDay.setUTCDate(firstDay.getUTCDate() - 6);
    const from = firstDay.toISOString();
    const raw = this.prisma.db.raw;
    const runtime = this.prisma.db.runtime();

    const [parcelsByStatus, parcelActivityLast7Days, queues, currencies] =
      await Promise.all([
        runtime.query(
          raw.sql`
            SELECT status::text AS status, count(*)::int AS count
            FROM shipments
            WHERE "companyId"=${companyId} AND "createdAt"<=${generatedAt}::timestamptz
            GROUP BY status ORDER BY status
          `.returnsRow({ status: 'pg/text@1', count: 'pg/int4@1' }).build(),
        ),
        runtime.query(
          raw.sql`
            WITH days AS (
              SELECT ${from.slice(0, 10)}::date + n AS date FROM generate_series(0,6) n
            ), activity AS (
              SELECT ("createdAt" AT TIME ZONE 'UTC')::date AS date,
                count(*)::int AS created, 0::int AS delivered, 0::int AS returned
              FROM shipments WHERE "companyId"=${companyId}
                AND "createdAt">=${from}::timestamptz AND "createdAt"<=${generatedAt}::timestamptz
              GROUP BY 1
              UNION ALL
              SELECT ("deliveredAt" AT TIME ZONE 'UTC')::date,
                0, count(*)::int, 0
              FROM shipments WHERE "companyId"=${companyId}
                AND "createdAt"<=${generatedAt}::timestamptz
                AND "deliveredAt">=${from}::timestamptz AND "deliveredAt"<=${generatedAt}::timestamptz
              GROUP BY 1
              UNION ALL
              SELECT ("returnedAt" AT TIME ZONE 'UTC')::date,
                0, 0, count(*)::int
              FROM shipments WHERE "companyId"=${companyId}
                AND "createdAt"<=${generatedAt}::timestamptz
                AND "returnedAt">=${from}::timestamptz AND "returnedAt"<=${generatedAt}::timestamptz
              GROUP BY 1
            )
            SELECT to_char(d.date,'YYYY-MM-DD') AS date,
              COALESCE(sum(a.created),0)::int AS created,
              COALESCE(sum(a.delivered),0)::int AS delivered,
              COALESCE(sum(a.returned),0)::int AS returned
            FROM days d LEFT JOIN activity a ON a.date=d.date
            GROUP BY d.date ORDER BY d.date
          `.returnsRow({ date: 'pg/text@1', created: 'pg/int4@1', delivered: 'pg/int4@1', returned: 'pg/int4@1' }).build(),
        ),
        runtime.query(
          raw.sql`
            SELECT
              (SELECT count(*)::int FROM pickup_requests
                WHERE "companyId"=${companyId} AND status IN ('REQUESTED','PROPOSED','CONFIRMED')
                AND "createdAt"<=${generatedAt}::timestamptz) AS pickups,
              (SELECT count(*)::int FROM merchant_settlements
                WHERE "companyId"=${companyId} AND status IN ('DRAFT','FINALIZED')
                AND "createdAt"<=${generatedAt}::timestamptz) AS settlements,
              (SELECT count(*)::int FROM merchant_settlement_requests
                WHERE "companyId"=${companyId} AND status='REQUESTED'
                AND "createdAt"<=${generatedAt}::timestamptz) AS requests
          `.returnsRow({ pickups: 'pg/int4@1', settlements: 'pg/int4@1', requests: 'pg/int4@1' }).build(),
        ),
        runtime.query(
          raw.sql`
            WITH scoped_parcels AS (
              SELECT id,"companyId",status,currency,"codMinor" FROM shipments
              WHERE "companyId"=${companyId} AND "createdAt"<=${generatedAt}::timestamptz
            ), scoped_collections AS (
              SELECT "shipmentId","companyId",currency,"goodsMinor" FROM cod_collections
              WHERE "companyId"=${companyId} AND "collectedAt"<=${generatedAt}::timestamptz
            ), scoped_ledger AS (
              SELECT currency,"amountMinor" FROM merchant_ledger_entries
              WHERE "companyId"=${companyId} AND "createdAt"<=${generatedAt}::timestamptz
            ), scoped_payments AS (
              SELECT currency,"amountMinor" FROM settlement_payments
              WHERE "companyId"=${companyId} AND "createdAt"<=${generatedAt}::timestamptz
            ), currencies AS (
              SELECT currency FROM scoped_parcels UNION SELECT currency FROM scoped_collections
              UNION SELECT currency FROM scoped_ledger UNION SELECT currency FROM scoped_payments
            ), pending AS (
              SELECT s.currency, sum(s."codMinor") AS amount
              FROM scoped_parcels s LEFT JOIN scoped_collections c
                ON c."shipmentId"=s.id AND c."companyId"=s."companyId"
              WHERE c."shipmentId" IS NULL AND s.status NOT IN
                ('CANCELLED','RETURNED','RETURN_IN_PROGRESS','RETURNED_TO_WAREHOUSE','RETURNED_TO_MERCHANT')
              GROUP BY s.currency
            ), collected AS (
              SELECT currency,sum("goodsMinor") AS amount FROM scoped_collections GROUP BY currency
            ), ledger AS (
              SELECT currency,sum("amountMinor") AS amount FROM scoped_ledger GROUP BY currency
            ), paid AS (
              SELECT currency,sum("amountMinor") AS amount FROM scoped_payments GROUP BY currency
            )
            SELECT c.currency,COALESCE(p.amount,0)::text AS pending,
              COALESCE(g.amount,0)::text AS collected,
              (COALESCE(l.amount,0)-COALESCE(s.amount,0))::text AS dues
            FROM currencies c LEFT JOIN pending p ON p.currency=c.currency
              LEFT JOIN collected g ON g.currency=c.currency
              LEFT JOIN ledger l ON l.currency=c.currency LEFT JOIN paid s ON s.currency=c.currency
            ORDER BY c.currency
          `.returnsRow({ currency: 'pg/text@1', pending: 'pg/text@1', collected: 'pg/text@1', dues: 'pg/text@1' }).build(),
        ),
      ]);

    const count = (...statuses: string[]) => parcelsByStatus
      .filter((row) => statuses.includes(row.status))
      .reduce((total, row) => total + row.count, 0);
    const totalParcels = parcelsByStatus.reduce((total, row) => total + row.count, 0);
    const delivered = count('DELIVERED');
    const cancelled = count('CANCELLED');
    const failedOrReturned = count('FAILED_DELIVERY', 'RETURNED', 'RETURN_IN_PROGRESS', 'RETURNED_TO_WAREHOUSE', 'RETURNED_TO_MERCHANT');

    return {
      companyId, generatedAt, timeZone: 'UTC',
      kpis: {
        totalParcels,
        inWarehouse: count('AT_WAREHOUSE'),
        outForDelivery: count('OUT_FOR_DELIVERY'),
        deliveredToday: parcelActivityLast7Days.find((day) => day.date === today)?.delivered ?? 0,
        returnsCount: failedOrReturned,
        pickupRequestsPending: queues[0]?.pickups ?? 0,
        settlementsPending: queues[0]?.settlements ?? 0,
      },
      parcelsByStatus,
      parcelActivityLast7Days,
      deliveryPerformance: {
        delivered, failedOrReturned, cancelled,
        inProgress: totalParcels - delivered - failedOrReturned - cancelled,
      },
      financeSnapshot: {
        currencies: currencies.map((row) => ({
          currency: row.currency,
          codPending: amount(BigInt(row.pending), row.currency),
          codCollected: amount(BigInt(row.collected), row.currency),
          merchantDuesPending: amount(BigInt(row.dues), row.currency),
        })),
        settlementRequestsPending: queues[0]?.requests ?? 0,
      },
    };
  }
}
