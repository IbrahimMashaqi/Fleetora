import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { MerchantPortalStore } from './merchant-portal.store.js';
import { ParcelLedger } from '../parcels/parcel-ledger.js';
import { ParcelStore, wire } from '../parcels/parcel-store.js';
import type {
  MerchantPageDto,
  SettlementRequestDto,
} from './merchant-portal.dto.js';
@Injectable()
export class MerchantFinanceService {
  constructor(
    @Inject(MerchantPortalStore) private readonly store: MerchantPortalStore,
    @Inject(ParcelLedger) private readonly ledger: ParcelLedger,
    @Inject(ParcelStore) private readonly company: ParcelStore,
  ) {}
  async companyRequests(actor: TokenPayload, q: MerchantPageDto) {
    return this.company.write(actor, 'viewFinance', async (tx, companyId) => {
      const rows = await tx.orm.public.MerchantSettlementRequest.where({
        companyId,
        status: 'REQUESTED',
      })
        .orderBy([(r) => r.createdAt.asc(), (r) => r.id.asc()])
        .offset((q.page - 1) * q.pageSize)
        .limit(q.pageSize + 1)
        .all();
      return {
        companyId,
        items: rows.slice(0, q.pageSize),
        page: q.page,
        pageSize: q.pageSize,
        hasNext: rows.length > q.pageSize,
      };
    });
  }
  async reviewRequest(actor: TokenPayload, id: string) {
    return this.company.write(actor, 'viewFinance', async (tx, companyId) => {
      const request = await tx.orm.public.MerchantSettlementRequest.where({
        id,
        companyId,
      }).first();
      if (!request) throw new NotFoundException('Settlement request not found');
      if (request.status !== 'REQUESTED')
        throw new ConflictException('Request already reviewed');
      await tx.orm.public.MerchantSettlementRequest.where({
        id,
        companyId,
        status: 'REQUESTED',
      }).update({ status: 'REVIEWED' });
      await tx.orm.public.MerchantAccessEvent.create({
        companyId,
        merchantId: request.merchantId,
        actorId: actor.sub,
        action: 'SETTLEMENT_REQUEST_REVIEWED',
        details: { requestId: id },
      });
      return { companyId, reviewed: true };
    });
  }
  async statement(actor: TokenPayload, q: MerchantPageDto) {
    const context = await this.store.access.resolve(actor, 'FINANCE_VIEW');
    const rows = await this.store.orm.MerchantLedgerEntry.where({
      companyId: context.companyId,
      merchantId: context.merchantId,
    })
      .orderBy([(r) => r.createdAt.desc(), (r) => r.id.desc()])
      .offset((q.page - 1) * q.pageSize)
      .limit(q.pageSize + 1)
      .all();
    return {
      items: rows.slice(0, q.pageSize).map(wire),
      page: q.page,
      pageSize: q.pageSize,
      hasNext: rows.length > q.pageSize,
      balances: await this.ledger.balances(
        context.companyId,
        context.merchantId,
      ),
    };
  }
  async settlementRequests(actor: TokenPayload, q: MerchantPageDto) {
    const context = await this.store.access.resolve(actor, 'FINANCE_VIEW');
    const rows = await this.store.orm.MerchantSettlementRequest.where({
      companyId: context.companyId,
      merchantId: context.merchantId,
    })
      .select('id', 'currency', 'notes', 'status', 'createdAt')
      .orderBy([(r) => r.createdAt.desc(), (r) => r.id.desc()])
      .offset((q.page - 1) * q.pageSize)
      .limit(q.pageSize + 1)
      .all();
    return {
      items: rows.slice(0, q.pageSize),
      page: q.page,
      pageSize: q.pageSize,
      hasNext: rows.length > q.pageSize,
    };
  }
  async requestSettlement(actor: TokenPayload, input: SettlementRequestDto) {
    const id = await this.store.write(
      actor,
      'SETTLEMENT_REQUEST',
      (tx, context) =>
        this.store.idempotent(
          tx,
          context,
          input.idempotencyKey,
          'SETTLEMENT_REQUEST',
          input,
          async () => {
            const row = await tx.orm.public.MerchantSettlementRequest.create({
              companyId: context.companyId,
              merchantId: context.merchantId,
              requestedBy: context.userId,
              currency: input.currency,
              notes: input.notes ?? null,
            });
            await tx.orm.public.MerchantAccessEvent.create({
              companyId: context.companyId,
              merchantId: context.merchantId,
              actorId: context.userId,
              action: 'SETTLEMENT_REQUESTED',
              details: { requestId: row.id },
            });
            return row.id;
          },
        ),
    );
    const context = await this.store.access.resolve(
      actor,
      'SETTLEMENT_REQUEST',
    );
    return {
      request: await this.store.orm.MerchantSettlementRequest.where({
        id,
        companyId: context.companyId,
        merchantId: context.merchantId,
      }).first(),
    };
  }
}
