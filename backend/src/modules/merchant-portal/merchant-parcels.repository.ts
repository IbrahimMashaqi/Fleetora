import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, or } from '@prisma/orm-postgres/orm-client';
import { randomUUID } from 'node:crypto';
import { MerchantPortalStore } from './merchant-portal.store.js';
import {
  now,
  pattern,
  wire,
  type ParcelTransaction,
  type ParcelRow,
} from '../parcels/parcel-store.js';
import type { MerchantContext } from '../merchant-access/merchant-access.types.js';
import type {
  MerchantParcelDto,
  MerchantPageDto,
} from './merchant-portal.dto.js';
import type { MerchantPricingService } from '../merchant-pricing/merchant-pricing.service.js';
import { TRANSITIONS } from '../parcels/parcel-domain.js';
function validStatus(value: string): asserts value is ParcelRow['status'] {
  if (!Object.hasOwn(TRANSITIONS, value))
    throw new BadRequestException('Invalid parcel status');
}
type Snapshot = Awaited<
  ReturnType<MerchantPricingService['quote']>
>['snapshot'];
export function merchantParcelWire(row: ParcelRow) {
  return {
    ...wire(row),
    finalCustomerAmount:
      row.pricingMode === 'FINAL_INCLUSIVE'
        ? wire(row).expectedCustomerTotal
        : null,
  };
}
@Injectable()
export class MerchantParcelsRepository {
  constructor(
    @Inject(MerchantPortalStore) private readonly store: MerchantPortalStore,
  ) {}
  async find(context: MerchantContext, id: string, tx?: ParcelTransaction) {
    const row = await (tx?.orm.public ?? this.store.orm).Shipment.where({
      id,
      companyId: context.companyId,
      merchantId: context.merchantId,
    }).first();
    if (!row) throw new NotFoundException('Parcel not found');
    return row;
  }
  async list(context: MerchantContext, q: MerchantPageDto) {
    let query = this.store.orm.Shipment.where({
      companyId: context.companyId,
      merchantId: context.merchantId,
    });
    if (q.search)
      query = query.where((s) =>
        or(
          s.trackingNumber.ilike(pattern(q.search!)),
          s.recipientName.ilike(pattern(q.search!)),
          s.merchantReference.ilike(pattern(q.search!)),
        ),
      );
    // Validated strings must still be checked against the generated status set in the service.
    if (q.status) {
      const status = q.status;
      validStatus(status);
      query = query.where({ status });
    }
    const items = await query
      .orderBy([(s) => s.createdAt.desc(), (s) => s.id.desc()])
      .offset((q.page - 1) * q.pageSize)
      .limit(q.pageSize + 1)
      .all();
    return {
      items: items.slice(0, q.pageSize).map(merchantParcelWire),
      page: q.page,
      pageSize: q.pageSize,
      hasNext: items.length > q.pageSize,
    };
  }
  async detail(context: MerchantContext, id: string) {
    const row = await this.find(context, id);
    const history =
      context.owner || context.permissions.includes('HISTORY_VIEW');
    const events = history
      ? await this.store.orm.ShipmentHistory.where({ shipmentId: id })
          .where((h) =>
            h.shipment.some((s) =>
              and(
                s.companyId.eq(context.companyId),
                s.merchantId.eq(context.merchantId),
              ),
            ),
          )
          .select(
            'id',
            'event',
            'fromStatus',
            'toStatus',
            'custody',
            'locationLabel',
            'occurredAt',
          )
          .orderBy([(e) => e.occurredAt.desc(), (e) => e.id.desc()])
          .limit(100)
          .all()
      : [];
    const beforeReceipt =
      row.status === 'CREATED' && row.custody === 'MERCHANT';
    const activeReceived =
      [
        'RECEIVED_FROM_MERCHANT',
        'AT_WAREHOUSE',
        'ASSIGNED',
        'OUT_FOR_DELIVERY',
        'FAILED_DELIVERY',
      ].includes(row.status) && row.custody !== 'MERCHANT';
    const edit = context.owner || context.permissions.includes('PARCEL_EDIT'),
      cancel = context.owner || context.permissions.includes('PARCEL_CANCEL');
    return {
      parcel: merchantParcelWire(row),
      events,
      historyAvailable: history,
      actions: {
        edit: edit && beforeReceipt,
        cancel: cancel && beforeReceipt,
        requestAmendment: edit && activeReceived,
        requestCancellation: cancel && activeReceived,
      },
    };
  }
  async save(
    tx: ParcelTransaction,
    context: Pick<MerchantContext, 'companyId' | 'merchantId' | 'userId'>,
    input: MerchantParcelDto,
    snapshot: Snapshot,
    old?: ParcelRow,
  ) {
    const merchant = await tx.orm.public.Merchant.where({
      id: context.merchantId,
      companyId: context.companyId,
    }).first();
    if (!merchant) throw new NotFoundException('Merchant not found');
    const data = {
      ...snapshot,
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
      secondaryPhone: input.secondaryPhone ?? null,
      city: input.city,
      destination: input.destination,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      description: input.description,
      pieces: input.pieces,
      merchantReference: input.merchantReference ?? null,
      customerNotes: input.notes ?? null,
      collectionMode: input.collectionMode,
      returnFeeMinor: old?.returnFeeMinor ?? merchant.returnFeeMinor,
      returnFeePolicy: old?.returnFeePolicy ?? merchant.returnFeePolicy,
      responsibleActorId: context.userId,
    };
    const parcel = old
      ? await tx.orm.public.Shipment.where({
          id: old.id,
          companyId: context.companyId,
          merchantId: context.merchantId,
          revision: old.revision,
        }).update({ ...data, revision: old.revision + 1 })
      : await tx.orm.public.Shipment.create({
          ...data,
          companyId: context.companyId,
          merchantId: context.merchantId,
          requestedBy: context.userId,
          trackingNumber: `FL-${randomUUID().replaceAll('-', '').toUpperCase()}`,
          status: 'CREATED',
          custody: 'MERCHANT',
          locationLabel: merchant.pickupAddress,
          locationSource: 'MERCHANT_ADDRESS',
          locationUpdatedAt: now(),
        });
    if (!parcel)
      throw new ConflictException('Parcel changed; reload before retrying');
    await tx.orm.public.ShipmentHistory.create({
      shipmentId: parcel.id,
      actorId: context.userId,
      event: old ? 'MERCHANT_PARCEL_EDITED' : 'MERCHANT_PARCEL_CREATED',
      fromStatus: old?.status ?? null,
      toStatus: parcel.status,
      custody: parcel.custody,
      locationLabel: parcel.locationLabel,
      note: JSON.stringify({
        before: old ? merchantParcelWire(old) : null,
        after: merchantParcelWire(parcel),
        reason: old ? 'Merchant parcel amendment' : 'Merchant parcel creation',
      }),
    });
    return parcel;
  }
}
