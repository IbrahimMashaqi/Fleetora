import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, or } from '@prisma/orm-postgres/orm-client';
import { shipmentFilter } from './parcel-filters.js';
import {
  ParcelStore,
  dateRange,
  instant,
  now,
  page,
  pattern,
  wire,
  type ParcelTransaction,
} from './parcel-store.js';
import {
  amount,
  assertFullAmount,
  assertRevision,
  collectionTotal,
  company,
  money,
  settlementTotals,
} from './parcel-domain.js';
import { collectionWire } from './parcel-operations.repository.js';
import { ParcelLedger } from './parcel-ledger.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import type {
  AdjustmentDto,
  CollectionDto,
  MethodDto,
  PageDto,
  PaymentDto,
  PreviewDto,
  ReversalDto,
  SettlementActionDto,
  SettlementCancelDto,
  SettlementCreateDto,
} from './parcel.dto.js';
@Injectable()
export class ParcelFinanceRepository {
  constructor(
    @Inject(ParcelStore) private readonly store: ParcelStore,
    @Inject(ParcelLedger) private readonly ledger: ParcelLedger,
  ) {}
  async collections(actor: TokenPayload, q: PageDto) {
    const companyId = company(actor, 'viewFinance');
    dateRange(q);
    let query = this.store.orm.CodCollection.where({ companyId });
    if (q.merchantId) query = query.where({ merchantId: q.merchantId });
    if (q.workerId) query = query.where({ workerId: q.workerId });
    if (q.currency) query = query.where({ currency: q.currency });
    query = query.where((c) =>
      c.shipment.some(
        shipmentFilter(companyId, { ...q, from: undefined, to: undefined }),
      ),
    );
    if (q.remitted !== undefined)
      query = query.where((c) =>
        q.remitted ? c.remittance.some() : c.remittance.none(),
      );
    if (q.from) query = query.where((c) => c.collectedAt.gte(instant(q.from!)));
    if (q.to)
      query = query.where((c) => c.collectedAt.lte(instant(q.to!, true)));
    return page(
      companyId,
      (
        await query
          .include('remittance', (r) => r.where({ companyId }))
          .orderBy([(c) => c.collectedAt.desc(), (c) => c.id.desc()])
          .offset((q.page - 1) * q.pageSize)
          .limit(q.pageSize + 1)
          .all()
      ).map(collectionWire),
      q,
    );
  }
  async collection(actor: TokenPayload, id: string) {
    const companyId = company(actor, 'viewFinance');
    const collection = await this.store.orm.CodCollection.where({
      companyId,
      id,
    })
      .include('remittance', (r) => r.where({ companyId }))
      .first();
    if (!collection) throw new NotFoundException('Collection not found');
    return { companyId, collection: collectionWire(collection) };
  }
  async collect(actor: TokenPayload, input: CollectionDto) {
    const id = await this.store.monetary(
      actor,
      'collect',
      input.idempotencyKey,
      'COLLECT',
      input,
      async (tx, companyId) => {
        const parcel = await tx.orm.public.Shipment.where({
          companyId,
          id: input.parcelId,
        }).first();
        if (!parcel?.merchantId)
          throw new NotFoundException('Parcel not found');
        if (parcel.status !== 'DELIVERED')
          throw new ConflictException(
            'Only delivered parcels can be collected',
          );
        assertFullAmount(
          money(input.amount, parcel.currency),
          collectionTotal(
            parcel.codMinor,
            parcel.deliveryFeeMinor,
            parcel.serviceFeeMinor,
            parcel.feePayer,
            parcel.pricingMode,
          ),
        );
        if (
          await tx.orm.public.CodCollection.where({
            companyId,
            shipmentId: parcel.id,
          }).first()
        )
          throw new ConflictException('Collection already recorded');
        const collection = await tx.orm.public.CodCollection.create({
          companyId,
          shipmentId: parcel.id,
          merchantId: parcel.merchantId,
          workerId: parcel.workerId,
          currency: parcel.currency,
          amountMinor: money(input.amount, parcel.currency),
          goodsMinor: parcel.codMinor,
          method: input.method,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          recordedBy: actor.sub,
        });
        if (parcel.codMinor > 0n)
          await tx.orm.public.MerchantLedgerEntry.create({
            companyId,
            merchantId: parcel.merchantId,
            shipmentId: parcel.id,
            collectionId: collection.id,
            currency: parcel.currency,
            kind: 'GOODS',
            amountMinor: parcel.codMinor,
            reason: 'Goods COD collected; awaiting company remittance',
            actorId: actor.sub,
            postingKey: `GOODS:${parcel.id}`,
          });
        await this.store.event(
          tx,
          parcel,
          actor,
          'COD_COLLECTED',
          input.reference,
        );
        return collection.id;
      },
    );
    return this.collection(actor, id);
  }
  async remit(actor: TokenPayload, id: string, input: MethodDto) {
    const result = await this.store.monetary(
      actor,
      'remit',
      input.idempotencyKey,
      `REMIT:${id}`,
      input,
      async (tx, companyId) => {
        const collection = await tx.orm.public.CodCollection.where({
          companyId,
          id,
        }).first();
        if (!collection) throw new NotFoundException('Collection not found');
        assertFullAmount(
          money(input.amount, collection.currency),
          collection.amountMinor,
        );
        if (
          await tx.orm.public.CashRemittance.where({
            companyId,
            collectionId: id,
          }).first()
        )
          throw new ConflictException('Remittance already recorded');
        await tx.orm.public.CashRemittance.create({
          companyId,
          collectionId: id,
          amountMinor: collection.amountMinor,
          method: input.method,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          actorId: actor.sub,
        });
        const parcel = await tx.orm.public.Shipment.where({
          companyId,
          id: collection.shipmentId,
        }).first();
        if (!parcel) throw new NotFoundException('Parcel not found');
        await this.store.event(
          tx,
          parcel,
          actor,
          'CASH_REMITTED',
          input.reference,
        );
        return id;
      },
    );
    return this.collection(actor, result);
  }
  async statement(actor: TokenPayload, merchantId: string, q: PageDto) {
    const companyId = company(actor, 'viewFinance');
    if (
      !(await this.store.orm.Merchant.where({ companyId, id: merchantId })
        .select('id')
        .first())
    )
      throw new NotFoundException('Merchant not found');
    dateRange(q);
    let query = this.store.orm.MerchantLedgerEntry.where({
      companyId,
      merchantId,
    });
    if (q.currency) query = query.where({ currency: q.currency });
    if (q.from) query = query.where((e) => e.createdAt.gte(instant(q.from!)));
    if (q.to) query = query.where((e) => e.createdAt.lte(instant(q.to!, true)));
    const entries = await query
      .include('allocation', (a) => a.where({ companyId }))
      .include('collection', (c) =>
        c
          .where({ companyId })
          .include('remittance', (r) => r.where({ companyId })),
      )
      .orderBy([(e) => e.createdAt.desc(), (e) => e.id.desc()])
      .offset((q.page - 1) * q.pageSize)
      .limit(q.pageSize + 1)
      .all();
    return {
      ...page(
        companyId,
        entries.map(({ allocation, collection, ...entry }) => ({
          ...wire(entry),
          eligible:
            !allocation && (!entry.collectionId || !!collection?.remittance),
          allocationSettlementId: allocation?.settlementId ?? null,
        })),
        q,
      ),
      balances: await this.ledger.balances(companyId, merchantId),
    };
  }
  async adjustment(actor: TokenPayload, input: AdjustmentDto) {
    const id = await this.store.monetary(
      actor,
      'approveSettlements',
      input.idempotencyKey,
      'ADJUSTMENT',
      input,
      async (tx, companyId) => {
        const merchant = await tx.orm.public.Merchant.where({
          companyId,
          id: input.merchantId,
        })
          .select('id')
          .first();
        if (!merchant) throw new NotFoundException('Merchant not found');
        const value = money(input.amount, input.currency, true);
        if (value === 0n)
          throw new BadRequestException('Adjustment must be nonzero');
        return (
          await tx.orm.public.MerchantLedgerEntry.create({
            companyId,
            merchantId: merchant.id,
            currency: input.currency,
            kind: 'ADJUSTMENT',
            amountMinor: value,
            reason: input.reason,
            actorId: actor.sub,
            postingKey: `ADJUSTMENT:${input.idempotencyKey}`,
          })
        ).id;
      },
    );
    return this.entry(actor, id);
  }
  async reversal(actor: TokenPayload, id: string, input: ReversalDto) {
    const result = await this.store.monetary(
      actor,
      'approveSettlements',
      input.idempotencyKey,
      `REVERSAL:${id}`,
      input,
      async (tx, companyId) => {
        const original = await tx.orm.public.MerchantLedgerEntry.where({
          companyId,
          id,
        })
          .include('allocation', (a) => a.where({ companyId }))
          .include('reversal', (r) => r.where({ companyId }))
          .first();
        if (!original) throw new NotFoundException('Entry not found');
        if (
          original.kind !== 'ADJUSTMENT' ||
          original.allocation ||
          original.reversal
        )
          throw new ConflictException(
            'Only unallocated, unreversed manual adjustments may be reversed',
          );
        return (
          await tx.orm.public.MerchantLedgerEntry.create({
            companyId,
            merchantId: original.merchantId,
            currency: original.currency,
            originalId: id,
            kind: 'REVERSAL',
            amountMinor: -original.amountMinor,
            reason: input.reason,
            actorId: actor.sub,
            postingKey: `REVERSAL:${id}`,
          })
        ).id;
      },
    );
    return this.entry(actor, result);
  }
  async entry(actor: TokenPayload, id: string) {
    const companyId = company(actor, 'viewFinance');
    const entry = await this.store.orm.MerchantLedgerEntry.where({
      companyId,
      id,
    }).first();
    if (!entry) throw new NotFoundException('Entry not found');
    return { companyId, entry: wire(entry) };
  }
  private async candidates(
    tx: ParcelTransaction,
    companyId: string,
    input: PreviewDto,
  ) {
    const dates = dateRange(input);
    if (
      !(await tx.orm.public.Merchant.where({ companyId, id: input.merchantId })
        .select('id')
        .first())
    )
      throw new NotFoundException('Merchant not found');
    const rows = await tx.query(
      this.store.prisma.db.raw.sql`
      SELECT e.id,e."shipmentId",e.kind,e."amountMinor",e.reason FROM merchant_ledger_entries e
      LEFT JOIN settlement_allocations a ON a."ledgerEntryId"=e.id AND a."companyId"=e."companyId"
      LEFT JOIN cash_remittances r ON r."collectionId"=e."collectionId" AND r."companyId"=e."companyId"
      WHERE e."companyId"=${companyId} AND e."merchantId"=${input.merchantId} AND e.currency=${input.currency}
        AND a.id IS NULL AND (e."collectionId" IS NULL OR r.id IS NOT NULL)
        AND e."createdAt">=${dates.from?.toString() ?? '0001-01-01T00:00:00Z'}::timestamptz
        AND e."createdAt"<=${dates.to?.toString() ?? '9999-12-31T23:59:59Z'}::timestamptz
      ORDER BY e."createdAt",e.id LIMIT 1001
    `
        .returnsRow({
          id: 'pg/text@1',
          shipmentId: { codecId: 'pg/text@1', nullable: true },
          kind: 'pg/text@1',
          amountMinor: 'pg/int8@1',
          reason: 'pg/text@1',
        })
        .build(),
    );
    if (rows.length > 1000)
      throw new BadRequestException(
        'Narrow the settlement date range to at most 1000 entries',
      );
    return rows;
  }
  private fingerprint(
    companyId: string,
    input: PreviewDto,
    rows: readonly { id: string; amountMinor: bigint }[],
  ) {
    const dates = dateRange(input);
    return createHash('sha256')
      .update(
        JSON.stringify({
          companyId,
          merchantId: input.merchantId,
          currency: input.currency,
          from: dates.from?.toString() ?? null,
          to: dates.to?.toString() ?? null,
          entries: rows.map((row) => [row.id, row.amountMinor.toString()]),
        }),
      )
      .digest('hex');
  }
  async preview(
    actor: TokenPayload,
    input: PreviewDto,
  ): Promise<{ companyId: string; preview: Record<string, unknown> }> {
    return this.store.write(
      actor,
      'createSettlements',
      async (tx, companyId) => {
        const rows = await this.candidates(tx, companyId, input);
        const totals = settlementTotals(rows);
        return {
          companyId,
          preview: {
            previewHash: this.fingerprint(companyId, input, rows),
            merchantId: input.merchantId,
            currency: input.currency,
            lines: rows.map((row) => ({
              ...wire({ ...row, currency: input.currency }),
              ledgerEntryId: row.id,
            })),
            ...Object.fromEntries(
              Object.entries(totals).map(([key, value]) => [
                key,
                amount(value, input.currency),
              ]),
            ),
          },
        };
      },
    );
  }
  async settlements(actor: TokenPayload, q: PageDto) {
    const companyId = company(actor, 'viewFinance');
    dateRange(q);
    let query = this.store.orm.MerchantSettlement.where({ companyId });
    if (q.merchantId) query = query.where({ merchantId: q.merchantId });
    if (q.status) query = query.where({ status: q.status });
    if (q.currency) query = query.where({ currency: q.currency });
    if (
      q.status &&
      !['DRAFT', 'FINALIZED', 'PAID', 'CANCELLED'].includes(q.status)
    )
      throw new BadRequestException('Invalid settlement status');
    if (q.from) query = query.where((s) => s.createdAt.gte(instant(q.from!)));
    if (q.to) query = query.where((s) => s.createdAt.lte(instant(q.to!, true)));
    if (q.search)
      query = query.where((s) =>
        or(
          s.id.ilike(pattern(q.search!)),
          s.merchant.some((m) =>
            and(m.companyId.eq(companyId), m.name.ilike(pattern(q.search!))),
          ),
        ),
      );
    return page(
      companyId,
      (
        await query
          .orderBy([(s) => s.createdAt.desc(), (s) => s.id.desc()])
          .offset((q.page - 1) * q.pageSize)
          .limit(q.pageSize + 1)
          .all()
      ).map(wire),
      q,
    );
  }
  async settlement(
    actor: TokenPayload,
    id: string,
  ): Promise<{
    companyId: string;
    settlement: Record<string, unknown> & {
      lines: Record<string, unknown>[];
      payments: Record<string, unknown>[];
    };
  }> {
    const companyId = company(actor, 'viewFinance');
    const settlement = await this.store.orm.MerchantSettlement.where({
      companyId,
      id,
    })
      .include('lines', (l) =>
        l
          .where({ companyId })
          .orderBy((l) => l.id.asc())
          .limit(1000),
      )
      .include('payments', (p) => p.where({ companyId }).limit(1))
      .first();
    if (!settlement) throw new NotFoundException('Settlement not found');
    const { lines, payments, ...rest } = settlement;
    return {
      companyId,
      settlement: {
        ...wire(rest),
        lines: lines.map((line) =>
          wire({ ...line, currency: settlement.currency }),
        ),
        payments: payments.map(wire),
      },
    };
  }
  async draft(actor: TokenPayload, input: SettlementCreateDto) {
    const id = await this.store.monetary(
      actor,
      'createSettlements',
      input.idempotencyKey,
      'SETTLEMENT_DRAFT',
      input,
      async (tx, companyId) => {
        const rows = await this.candidates(tx, companyId, input);
        if (
          input.expectedPreviewHash !== this.fingerprint(companyId, input, rows)
        )
          throw new ConflictException(
            'Settlement preview changed. Preview again before confirming',
          );
        const totals = settlementTotals(rows);
        if (totals.netPayable <= 0n)
          throw new BadRequestException(
            'Settlement requires a positive eligible balance',
          );
        const balances = await tx.query(
          this.store.prisma.db.raw.sql`
        SELECT COALESCE(sum(e."amountMinor"),0)::text AS eligible
        FROM merchant_ledger_entries e
        LEFT JOIN settlement_allocations a ON a."ledgerEntryId"=e.id AND a."companyId"=e."companyId"
        LEFT JOIN cash_remittances r ON r."collectionId"=e."collectionId" AND r."companyId"=e."companyId"
        WHERE e."companyId"=${companyId} AND e."merchantId"=${input.merchantId} AND e.currency=${input.currency}
          AND a.id IS NULL AND (e."collectionId" IS NULL OR r.id IS NOT NULL)
      `
            .returnsRow({ eligible: 'pg/text@1' })
            .build(),
        );
        if (!balances[0] || totals.netPayable > BigInt(balances[0].eligible))
          throw new BadRequestException(
            'Include outstanding fees and adjustments in the settlement date range',
          );
        const settlement = await tx.orm.public.MerchantSettlement.create({
          companyId,
          merchantId: input.merchantId,
          currency: input.currency,
          createdBy: actor.sub,
          grossCollectedMinor: totals.grossCollected,
          deliveryFeesMinor: totals.deliveryFees,
          returnFeesMinor: totals.returnFees,
          adjustmentsMinor: totals.adjustments,
          netPayableMinor: totals.netPayable,
          from: input.from ? instant(input.from) : null,
          to: input.to ? instant(input.to, true) : null,
        });
        await tx.orm.public.MerchantSettlementLine.createAll(
          rows.map((row) => ({
            companyId,
            settlementId: settlement.id,
            ledgerEntryId: row.id,
            shipmentId: row.shipmentId,
            kind: row.kind,
            amountMinor: row.amountMinor,
            reason: row.reason,
          })),
        );
        await tx.orm.public.SettlementAllocation.createAll(
          rows.map((row) => ({
            companyId,
            settlementId: settlement.id,
            ledgerEntryId: row.id,
          })),
        );
        return settlement.id;
      },
    );
    return this.settlement(actor, id);
  }
  async finalize(actor: TokenPayload, id: string, input: SettlementActionDto) {
    const result = await this.store.monetary(
      actor,
      'approveSettlements',
      input.idempotencyKey,
      `SETTLEMENT_FINALIZE:${id}`,
      input,
      async (tx, companyId) => {
        const settlement = await tx.orm.public.MerchantSettlement.where({
          companyId,
          id,
        })
          .include('lines', (l) => l.where({ companyId }).limit(1001))
          .include('allocations', (a) => a.where({ companyId }).limit(1001))
          .first();
        if (!settlement) throw new NotFoundException('Settlement not found');
        assertRevision(settlement.revision, input.revision);
        if (settlement.status !== 'DRAFT')
          throw new ConflictException(
            'Only draft settlements may be finalized',
          );
        if (
          !settlement.lines.length ||
          settlement.lines.length !== settlement.allocations.length ||
          settlementTotals(settlement.lines).netPayable !==
            settlement.netPayableMinor
        )
          throw new ConflictException('Settlement allocation changed');
        await tx.orm.public.MerchantSettlement.where({
          companyId,
          id,
          revision: settlement.revision,
        }).update({
          status: 'FINALIZED',
          finalizedBy: actor.sub,
          finalizedAt: now(),
          revision: settlement.revision + 1,
        });
        return id;
      },
    );
    return this.settlement(actor, result);
  }
  async cancel(actor: TokenPayload, id: string, input: SettlementCancelDto) {
    const result = await this.store.monetary(
      actor,
      'createSettlements',
      input.idempotencyKey,
      `SETTLEMENT_CANCEL:${id}`,
      input,
      async (tx, companyId) => {
        const settlement = await tx.orm.public.MerchantSettlement.where({
          companyId,
          id,
        }).first();
        if (!settlement) throw new NotFoundException('Settlement not found');
        assertRevision(settlement.revision, input.revision);
        if (settlement.status !== 'DRAFT')
          throw new ConflictException(
            'Only draft settlements may be cancelled',
          );
        await tx.orm.public.MerchantSettlement.where({
          companyId,
          id,
          revision: settlement.revision,
        }).update({
          status: 'CANCELLED',
          cancelledBy: actor.sub,
          cancelledAt: now(),
          cancellationReason: input.reason,
          revision: settlement.revision + 1,
        });
        // Reservation rows have no accounting meaning. Immutable historical lines remain.
        await tx.orm.public.SettlementAllocation.where({
          companyId,
          settlementId: id,
        }).deleteAll();
        return id;
      },
    );
    return this.settlement(actor, result);
  }
  async pay(actor: TokenPayload, id: string, input: PaymentDto) {
    const result = await this.store.monetary(
      actor,
      'paySettlements',
      input.idempotencyKey,
      `SETTLEMENT_PAY:${id}`,
      input,
      async (tx, companyId) => {
        const settlement = await tx.orm.public.MerchantSettlement.where({
          companyId,
          id,
        }).first();
        if (!settlement) throw new NotFoundException('Settlement not found');
        assertRevision(settlement.revision, input.revision);
        if (settlement.status !== 'FINALIZED' || !settlement.finalizedBy)
          throw new ConflictException(
            'Admin finalization is required before payment',
          );
        assertFullAmount(
          money(input.amount, settlement.currency),
          settlement.netPayableMinor,
        );
        if (Date.parse(input.paidAt) > Date.now() + 60000)
          throw new BadRequestException('Payment date cannot be in the future');
        await tx.orm.public.SettlementPayment.create({
          companyId,
          settlementId: id,
          currency: settlement.currency,
          amountMinor: settlement.netPayableMinor,
          method: input.method,
          reference: input.reference,
          paidAt: instant(input.paidAt),
          recordedBy: actor.sub,
        });
        await tx.orm.public.MerchantSettlement.where({
          companyId,
          id,
          revision: settlement.revision,
        }).update({
          status: 'PAID',
          paidAt: instant(input.paidAt),
          revision: settlement.revision + 1,
        });
        return id;
      },
    );
    return this.settlement(actor, result);
  }
}
