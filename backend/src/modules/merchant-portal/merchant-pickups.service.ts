import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TokenPayload } from '../auth/token/token.payload.js';
import type { MerchantContext } from '../merchant-access/merchant-access.types.js';
import {
  ParcelStore,
  instant,
  now,
  type ParcelTransaction,
} from '../parcels/parcel-store.js';
import { assertRevision } from '../parcels/parcel-domain.js';
import { MerchantPortalStore } from './merchant-portal.store.js';
import {
  MerchantWorkflowError,
  requireCoordinates,
  requireUnreceived,
  requireWindow,
} from './merchant-portal.domain.js';
import type {
  MerchantPageDto,
  MerchantPickupActionDto,
  PickupCreateDto,
  PickupReceiptDto,
  PickupReviewDto,
} from './merchant-portal.dto.js';
import { not } from '@prisma/orm-postgres/orm-client';
@Injectable()
export class MerchantPickupsService {
  constructor(
    @Inject(MerchantPortalStore) private readonly store: MerchantPortalStore,
    @Inject(ParcelStore) private readonly companyStore: ParcelStore,
  ) {}
  private validate(effect: () => void) {
    try {
      effect();
    } catch (error) {
      if (error instanceof MerchantWorkflowError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }
  async list(actor: TokenPayload, q: MerchantPageDto) {
    return this.scopedList(
      await this.store.access.resolve(actor, 'PICKUP_MANAGE'),
      q,
    );
  }
  private async scopedList(
    scope: { companyId: string; merchantId?: string },
    q: MerchantPageDto,
  ) {
    let query = this.store.orm.PickupRequest.where({
      companyId: scope.companyId,
      ...(scope.merchantId ? { merchantId: scope.merchantId } : {}),
    });
    if (q.status) query = query.where({ status: q.status });
    const rows = await query
      .orderBy([(p) => p.createdAt.desc(), (p) => p.id.desc()])
      .offset((q.page - 1) * q.pageSize)
      .limit(q.pageSize + 1)
      .all();
    return {
      companyId: scope.companyId,
      items: rows.slice(0, q.pageSize),
      page: q.page,
      pageSize: q.pageSize,
      hasNext: rows.length > q.pageSize,
    };
  }
  async details(actor: TokenPayload, id: string) {
    const context = await this.store.access.resolve(actor, 'PICKUP_MANAGE');
    return this.detail(context, id);
  }
  private async detail(
    scope: { companyId: string; merchantId?: string },
    id: string,
  ) {
    const pickup = await this.store.orm.PickupRequest.where({
      companyId: scope.companyId,
      ...(scope.merchantId ? { merchantId: scope.merchantId } : {}),
      id,
    })
      .include('parcels', (p) => p.where({ companyId: scope.companyId }))
      .first();
    if (!pickup) throw new NotFoundException('Pickup request not found');
    return { companyId: scope.companyId, pickup };
  }
  async create(actor: TokenPayload, input: PickupCreateDto) {
    this.validate(() => {
      requireCoordinates(input.latitude, input.longitude);
      requireWindow(
        input.preferredFrom,
        input.preferredTo,
        input.method === 'COMPANY_PICKUP',
      );
    });
    const id = await this.store.write(actor, 'PICKUP_MANAGE', (tx, context) =>
      this.store.idempotent(
        tx,
        context,
        input.idempotencyKey,
        'PICKUP_CREATE',
        input,
        async () => {
          const merchant = await tx.orm.public.Merchant.where({
            id: context.merchantId,
            companyId: context.companyId,
          }).first();
          if (!merchant) throw new NotFoundException('Merchant not found');
          if (new Set(input.parcelIds).size !== input.parcelIds.length)
            throw new BadRequestException('Duplicate parcels');
          for (const id of input.parcelIds) {
            const parcel = await tx.orm.public.Shipment.where({
              id,
              companyId: context.companyId,
              merchantId: context.merchantId,
            }).first();
            if (!parcel) throw new NotFoundException('Parcel not found');
            this.validate(() => requireUnreceived(parcel));
            if (
              await tx.orm.public.PickupParcel.where({
                shipmentId: id,
                companyId: context.companyId,
                active: true,
              }).first()
            )
              throw new ConflictException(
                'Parcel already belongs to a pending pickup request',
              );
          }
          if (
            input.warehouseId &&
            !(await tx.orm.public.Warehouse.where({
              id: input.warehouseId,
              companyId: context.companyId,
            }).first())
          )
            throw new NotFoundException('Warehouse not found');
          // An alternate address without a pin must not silently inherit the primary address's GPS pin.
          const alternate = input.pickupAddress !== undefined;
          const pickup = await tx.orm.public.PickupRequest.create({
            companyId: context.companyId,
            merchantId: context.merchantId,
            createdBy: context.userId,
            method: input.method,
            preferredFrom: input.preferredFrom
              ? instant(input.preferredFrom)
              : null,
            preferredTo: input.preferredTo ? instant(input.preferredTo) : null,
            pickupAddress: input.pickupAddress ?? merchant.pickupAddress,
            latitude: input.latitude ?? (alternate ? null : merchant.latitude),
            longitude:
              input.longitude ?? (alternate ? null : merchant.longitude),
            warehouseId: input.warehouseId ?? null,
            notes: input.notes ?? null,
          });
          for (const shipmentId of input.parcelIds) {
            await tx.orm.public.PickupParcel.create({
              companyId: context.companyId,
              merchantId: context.merchantId,
              pickupId: pickup.id,
              shipmentId,
            });
            await tx.orm.public.Shipment.where({
              id: shipmentId,
              companyId: context.companyId,
              merchantId: context.merchantId,
            }).update({ pickupMethod: input.method });
            await tx.orm.public.ShipmentHistory.create({
              shipmentId,
              actorId: context.userId,
              event: 'PICKUP_REQUESTED',
              fromStatus: 'CREATED',
              toStatus: 'CREATED',
              custody: 'MERCHANT',
              note: pickup.id,
            });
          }
          return pickup.id;
        },
      ),
    );
    return this.details(actor, id);
  }
  async merchantAction(
    actor: TokenPayload,
    id: string,
    input: MerchantPickupActionDto,
  ) {
    await this.store.write(actor, 'PICKUP_MANAGE', async (tx, context) => {
      const pickup = await tx.orm.public.PickupRequest.where({
        id,
        companyId: context.companyId,
        merchantId: context.merchantId,
      }).first();
      if (!pickup) throw new NotFoundException('Pickup request not found');
      assertRevision(pickup.revision, input.revision);
      if (input.action === 'ACCEPT_PROPOSAL') {
        if (
          pickup.status !== 'PROPOSED' ||
          !pickup.proposedFrom ||
          !pickup.proposedTo
        )
          throw new ConflictException(
            'No proposed window is awaiting acceptance',
          );
        await tx.orm.public.PickupRequest.where({
          id,
          companyId: context.companyId,
        }).update({
          status: 'CONFIRMED',
          confirmedFrom: pickup.proposedFrom,
          confirmedTo: pickup.proposedTo,
          revision: pickup.revision + 1,
        });
      } else {
        if (
          await tx.orm.public.PickupParcel.where({
            pickupId: id,
            companyId: context.companyId,
          })
            .where((p) => not(p.receipt.eq('PENDING')))
            .first()
        )
          throw new ConflictException('A received pickup cannot be cancelled');
        if (pickup.status === 'CANCELLED')
          throw new ConflictException('Pickup already cancelled');
        await tx.orm.public.PickupRequest.where({
          id,
          companyId: context.companyId,
        }).update({ status: 'CANCELLED', revision: pickup.revision + 1 });
        await tx.orm.public.PickupParcel.where({
          pickupId: id,
          companyId: context.companyId,
        }).updateAll({ active: false });
      }
      await this.audit(tx, context, id, input.action);
    });
    return this.details(actor, id);
  }
  private async audit(
    tx: ParcelTransaction,
    context: Pick<MerchantContext, 'companyId' | 'merchantId' | 'userId'>,
    pickupId: string,
    action: string,
  ) {
    await tx.orm.public.MerchantAccessEvent.create({
      companyId: context.companyId,
      merchantId: context.merchantId,
      actorId: context.userId,
      action: `PICKUP_${action}`,
      details: { pickupId },
    });
  }
  async companyList(actor: TokenPayload, q: MerchantPageDto) {
    return this.companyStore.write(
      actor,
      'manageParcels',
      async (_tx, companyId) => this.scopedList({ companyId }, q),
    );
  }
  async companyDetails(actor: TokenPayload, id: string) {
    return this.companyStore.write(
      actor,
      'manageParcels',
      async (_tx, companyId) => this.detail({ companyId }, id),
    );
  }
  async review(actor: TokenPayload, id: string, input: PickupReviewDto) {
    if (input.action !== 'CANCEL')
      this.validate(() => requireWindow(input.from, input.to, true));
    await this.companyStore.write(
      actor,
      'manageParcels',
      async (tx, companyId) => {
        const pickup = await tx.orm.public.PickupRequest.where({
          id,
          companyId,
        }).first();
        if (!pickup) throw new NotFoundException('Pickup request not found');
        assertRevision(pickup.revision, input.revision);
        if (['RECEIVED', 'CANCELLED'].includes(pickup.status))
          throw new ConflictException('Pickup is closed');
        if (
          input.workerId &&
          !(await tx.orm.public.Worker.where({ id: input.workerId, companyId })
            .where((w) => not(w.status.eq('SUSPENDED')))
            .first())
        )
          throw new NotFoundException('Eligible pickup driver not found');
        if (
          input.warehouseId &&
          !(await tx.orm.public.Warehouse.where({
            id: input.warehouseId,
            companyId,
          }).first())
        )
          throw new NotFoundException('Warehouse not found');
        if (input.action === 'CANCEL') {
          if (
            await tx.orm.public.PickupParcel.where({ pickupId: id, companyId })
              .where((p) => not(p.receipt.eq('PENDING')))
              .first()
          )
            throw new ConflictException('Cannot cancel after receipt');
          await tx.orm.public.PickupParcel.where({
            pickupId: id,
            companyId,
          }).updateAll({ active: false });
        }
        await tx.orm.public.PickupRequest.where({ id, companyId }).update({
          status:
            input.action === 'CANCEL'
              ? 'CANCELLED'
              : input.action === 'PROPOSE'
                ? 'PROPOSED'
                : 'CONFIRMED',
          ...(input.action === 'PROPOSE'
            ? {
                proposedFrom: instant(input.from!),
                proposedTo: instant(input.to!),
                confirmedFrom: null,
                confirmedTo: null,
              }
            : input.action === 'CONFIRM'
              ? {
                  confirmedFrom: instant(input.from!),
                  confirmedTo: instant(input.to!),
                }
              : {}),
          workerId: input.workerId ?? pickup.workerId,
          warehouseId: input.warehouseId ?? pickup.warehouseId,
          reviewedBy: actor.sub,
          revision: pickup.revision + 1,
        });
        await this.audit(
          tx,
          { companyId, merchantId: pickup.merchantId, userId: actor.sub },
          id,
          input.action,
        );
      },
    );
    return this.companyDetails(actor, id);
  }
  async receive(actor: TokenPayload, id: string, input: PickupReceiptDto) {
    await this.companyStore.write(
      actor,
      'manageParcels',
      async (tx, companyId) => {
        const pickup = await tx.orm.public.PickupRequest.where({
          id,
          companyId,
        }).first();
        if (!pickup) throw new NotFoundException('Pickup request not found');
        assertRevision(pickup.revision, input.revision);
        if (pickup.status !== 'CONFIRMED')
          throw new ConflictException(
            'Confirm the pickup before recording physical receipt',
          );
        if (
          new Set(input.parcels.map((p) => p.parcelId)).size !==
          input.parcels.length
        )
          throw new BadRequestException('Duplicate receipt entries');
        for (const entry of input.parcels) {
          const link = await tx.orm.public.PickupParcel.where({
            pickupId: id,
            companyId,
            merchantId: pickup.merchantId,
            shipmentId: entry.parcelId,
            receipt: 'PENDING',
          }).first();
          const parcel = await tx.orm.public.Shipment.where({
            id: entry.parcelId,
            companyId,
            merchantId: pickup.merchantId,
          }).first();
          if (!link || !parcel)
            throw new NotFoundException('Pending pickup parcel not found');
          if (entry.receipt !== 'RECEIVED' && !entry.notes?.trim())
            throw new BadRequestException(
              'Missing or discrepant items require an explanation',
            );
          this.validate(() => requireUnreceived(parcel));
          await tx.orm.public.PickupParcel.where({
            id: link.id,
            companyId,
          }).update({
            receipt: entry.receipt,
            receiptNotes: entry.notes ?? null,
            receivedBy: actor.sub,
            receivedAt: now(),
            active: false,
          });
          if (entry.receipt !== 'MISSING') {
            const custody =
              pickup.method === 'WAREHOUSE_DROPOFF'
                ? 'WAREHOUSE'
                : pickup.workerId
                  ? 'DRIVER'
                  : 'COMPANY';
            const status =
              pickup.method === 'WAREHOUSE_DROPOFF'
                ? 'AT_WAREHOUSE'
                : 'RECEIVED_FROM_MERCHANT';
            await tx.orm.public.Shipment.where({
              id: parcel.id,
              companyId,
              merchantId: pickup.merchantId,
              revision: parcel.revision,
            }).update({
              status,
              custody,
              workerId: pickup.workerId,
              warehouseId: pickup.warehouseId,
              locationLabel:
                pickup.method === 'WAREHOUSE_DROPOFF'
                  ? 'Company warehouse'
                  : pickup.pickupAddress,
              locationSource: 'CONFIRMED_RECEIPT',
              locationUpdatedAt: now(),
              responsibleActorId: actor.sub,
              revision: parcel.revision + 1,
            });
            await tx.orm.public.ShipmentHistory.create({
              shipmentId: parcel.id,
              actorId: actor.sub,
              event: 'PHYSICAL_RECEIPT_CONFIRMED',
              fromStatus: parcel.status,
              toStatus: status,
              custody,
              note: entry.notes ?? null,
            });
          }
        }
        const remaining = await tx.orm.public.PickupParcel.where({
          pickupId: id,
          companyId,
          receipt: 'PENDING',
        }).first();
        await tx.orm.public.PickupRequest.where({ id, companyId }).update({
          status: remaining ? 'CONFIRMED' : 'RECEIVED',
          revision: pickup.revision + 1,
        });
        await this.audit(
          tx,
          { companyId, merchantId: pickup.merchantId, userId: actor.sub },
          id,
          'RECEIPT_RECORDED',
        );
      },
    );
    return this.companyDetails(actor, id);
  }
}
