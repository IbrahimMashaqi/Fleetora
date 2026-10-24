import { Inject, Injectable } from '@nestjs/common';
import { amount } from './parcel-domain.js';
import {
  ParcelStore,
  type ParcelRow,
  type ParcelTransaction,
} from './parcel-store.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
@Injectable()
export class ParcelLedger {
  constructor(@Inject(ParcelStore) private readonly store: ParcelStore) {}
  async charge(
    tx: ParcelTransaction,
    parcel: ParcelRow,
    actor: TokenPayload,
    kind: 'DELIVERY_FEE' | 'RETURN_FEE',
  ) {
    if (!parcel.merchantId) return;
    const value =
      kind === 'RETURN_FEE'
        ? parcel.returnFeePolicy === 'NONE'
          ? 0n
          : parcel.returnFeeMinor
        : parcel.feePayer === 'MERCHANT'
          ? parcel.deliveryFeeMinor + parcel.serviceFeeMinor
          : 0n;
    if (value === 0n) return;
    await tx.orm.public.MerchantLedgerEntry.create({
      companyId: parcel.companyId,
      merchantId: parcel.merchantId,
      shipmentId: parcel.id,
      currency: parcel.currency,
      kind,
      amountMinor: -value,
      reason: kind,
      actorId: actor.sub,
      postingKey: `${kind}:${parcel.id}`,
    });
  }
  async balances(companyId: string, merchantId: string) {
    const rows = await this.store.prisma.db.runtime().query(
      this.store.prisma.db.raw.sql`
      SELECT e.currency,
        COALESCE(sum(e."amountMinor"),0)::text AS total,
        COALESCE(sum(e."amountMinor") FILTER (WHERE a.id IS NULL AND (e."collectionId" IS NULL OR r.id IS NOT NULL)),0)::text AS eligible,
        COALESCE((SELECT sum(p."amountMinor") FROM settlement_payments p JOIN merchant_settlements s ON s.id=p."settlementId" AND s."companyId"=p."companyId" WHERE s."companyId"=${companyId} AND s."merchantId"=${merchantId} AND p.currency=e.currency),0)::text AS paid
      FROM merchant_ledger_entries e
      LEFT JOIN settlement_allocations a ON a."ledgerEntryId"=e.id AND a."companyId"=e."companyId"
      LEFT JOIN cash_remittances r ON r."collectionId"=e."collectionId" AND r."companyId"=e."companyId"
      WHERE e."companyId"=${companyId} AND e."merchantId"=${merchantId}
      GROUP BY e.currency ORDER BY e.currency
    `
        .returnsRow({
          currency: 'pg/text@1',
          total: 'pg/text@1',
          eligible: 'pg/text@1',
          paid: 'pg/text@1',
        })
        .build(),
    );
    return rows.map((row) => ({
      currency: row.currency,
      balance: amount(BigInt(row.total) - BigInt(row.paid), row.currency),
      eligible: amount(BigInt(row.eligible), row.currency),
      paid: amount(BigInt(row.paid), row.currency),
    }));
  }
}
