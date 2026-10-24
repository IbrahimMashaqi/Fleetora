import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { MerchantPricingService } from '../merchant-pricing/merchant-pricing.service.js';
import { MerchantPortalStore } from './merchant-portal.store.js';
import {
  MerchantParcelsRepository,
  merchantParcelWire,
} from './merchant-parcels.repository.js';
import {
  requireCollectionMode,
  requireCoordinates,
  requireUnreceived,
  MerchantWorkflowError,
} from './merchant-portal.domain.js';
import { assertRevision, TRANSITIONS } from '../parcels/parcel-domain.js';
import type {
  MerchantCancelDto,
  MerchantPageDto,
  MerchantParcelDto,
  MerchantParcelEditDto,
  MerchantPreviewDto,
} from './merchant-portal.dto.js';
import type { ParcelTransaction } from '../parcels/parcel-store.js';
import type { MerchantContext } from '../merchant-access/merchant-access.types.js';
@Injectable()
export class MerchantParcelsService {
  constructor(
    @Inject(MerchantPortalStore) readonly store: MerchantPortalStore,
    @Inject(MerchantParcelsRepository)
    private readonly repository: MerchantParcelsRepository,
    @Inject(MerchantPricingService)
    private readonly pricing: MerchantPricingService,
  ) {}
  async list(actor: TokenPayload, q: MerchantPageDto) {
    if (q.status && !Object.hasOwn(TRANSITIONS, q.status))
      throw new BadRequestException('Invalid parcel status');
    return this.repository.list(
      await this.store.access.resolve(actor, 'PARCEL_VIEW'),
      q,
    );
  }
  async details(actor: TokenPayload, id: string) {
    return this.repository.detail(
      await this.store.access.resolve(actor, 'PARCEL_VIEW'),
      id,
    );
  }
  async zones(actor: TokenPayload) {
    const context = await this.pricingContext(actor);
    return {
      items: await this.store.orm.DeliveryZone.where({
        companyId: context.companyId,
        active: true,
      })
        .select('id', 'name', 'city', 'currency')
        .orderBy([(z) => z.city.asc(), (z) => z.name.asc()])
        .limit(1000)
        .all(),
    };
  }
  async preview(actor: TokenPayload, input: MerchantPreviewDto) {
    const context = await this.pricingContext(actor);
    return {
      preview: (
        await this.pricing.quote(
          context.companyId,
          context.merchantId,
          input.zoneId,
          input.finalCustomerAmount,
        )
      ).preview,
    };
  }
  async create(actor: TokenPayload, input: MerchantParcelDto) {
    const id = await this.store.write(actor, 'PARCEL_CREATE', (tx, context) =>
      this.store.idempotent(
        tx,
        context,
        input.idempotencyKey,
        'PARCEL_CREATE',
        input,
        async () => (await this.createIn(tx, context, input)).id,
      ),
    );
    return {
      parcel: merchantParcelWire(
        await this.repository.find(
          await this.store.access.resolve(actor, 'PARCEL_CREATE'),
          id,
        ),
      ),
    };
  }
  private async pricingContext(actor: TokenPayload) {
    const context = await this.store.access.resolve(actor);
    if (
      !context.owner &&
      !context.permissions.some((p) =>
        ['PARCEL_CREATE', 'PARCEL_EDIT', 'PARCEL_IMPORT'].includes(p),
      )
    )
      throw new ForbiddenException('Parcel pricing permission required');
    return context;
  }
  async createIn(
    tx: ParcelTransaction,
    context: MerchantContext,
    input: MerchantParcelDto,
  ) {
    const quote = await this.pricing.quote(
      context.companyId,
      context.merchantId,
      input.zoneId,
      input.finalCustomerAmount,
      tx,
    );
    if (quote.preview.pricingVersion !== input.pricingVersion)
      throw new ConflictException(
        'Pricing changed; review the current preview before confirming',
      );
    if (input.city !== quote.preview.city)
      throw new BadRequestException(
        'Delivery city must match the selected zone',
      );
    this.validateInput(input, quote.snapshot.codMinor);
    return this.repository.save(tx, context, input, quote.snapshot);
  }
  private validateInput(input: MerchantParcelDto, amount: bigint) {
    try {
      requireCoordinates(input.latitude, input.longitude);
      requireCollectionMode(amount, input.collectionMode);
    } catch (error) {
      if (error instanceof MerchantWorkflowError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }
  async edit(actor: TokenPayload, id: string, input: MerchantParcelEditDto) {
    await this.store.write(actor, 'PARCEL_EDIT', async (tx, context) => {
      const old = await this.repository.find(context, id, tx);
      this.unreceived(old);
      assertRevision(old.revision, input.revision);
      if (
        await tx.orm.public.PickupParcel.where({
          shipmentId: id,
          companyId: context.companyId,
          active: true,
        }).first()
      )
        throw new ConflictException(
          'Cancel the pickup request before changing a grouped parcel',
        );
      const quote = await this.pricing.quote(
        context.companyId,
        context.merchantId,
        input.zoneId,
        input.finalCustomerAmount,
        tx,
      );
      if (quote.preview.pricingVersion !== input.pricingVersion)
        throw new ConflictException(
          'Pricing changed; review the current preview',
        );
      if (input.city !== quote.preview.city)
        throw new BadRequestException(
          'Delivery city must match the selected zone',
        );
      this.validateInput(input, quote.snapshot.codMinor);
      await this.repository.save(tx, context, input, quote.snapshot, old);
    });
    return {
      parcel: merchantParcelWire(
        await this.repository.find(
          await this.store.access.resolve(actor, 'PARCEL_EDIT'),
          id,
        ),
      ),
    };
  }
  private unreceived(parcel: { status: string; custody: string }) {
    try {
      requireUnreceived(parcel);
    } catch (error) {
      if (error instanceof MerchantWorkflowError)
        throw new ConflictException(error.message);
      throw error;
    }
  }
  async cancel(actor: TokenPayload, id: string, input: MerchantCancelDto) {
    await this.store.write(actor, 'PARCEL_CANCEL', async (tx, context) => {
      const old = await this.repository.find(context, id, tx);
      this.unreceived(old);
      assertRevision(old.revision, input.revision);
      if (
        await tx.orm.public.PickupParcel.where({
          shipmentId: id,
          companyId: context.companyId,
          active: true,
        }).first()
      )
        throw new ConflictException(
          'Cancel the pickup request before cancelling a grouped parcel',
        );
      await tx.orm.public.Shipment.where({
        id,
        companyId: context.companyId,
        merchantId: context.merchantId,
        revision: old.revision,
      }).update({
        status: 'CANCELLED',
        revision: old.revision + 1,
        responsibleActorId: context.userId,
      });
      await tx.orm.public.ShipmentHistory.create({
        shipmentId: id,
        actorId: context.userId,
        event: 'MERCHANT_PARCEL_CANCELLED',
        fromStatus: old.status,
        toStatus: 'CANCELLED',
        note: input.reason,
        custody: old.custody,
      });
    });
    return {
      parcel: merchantParcelWire(
        await this.repository.find(
          await this.store.access.resolve(actor, 'PARCEL_CANCEL'),
          id,
        ),
      ),
    };
  }
  async label(actor: TokenPayload, id: string) {
    const parcel = await this.repository.find(
      await this.store.access.resolve(actor, 'PARCEL_VIEW'),
      id,
    );
    if (!parcel.trackingNumber)
      throw new BadRequestException('Tracking identity is unavailable');
    const { toString } = await import('qrcode');
    return {
      trackingNumber: parcel.trackingNumber,
      qrSvg: await toString(parcel.trackingNumber, {
        type: 'svg',
        errorCorrectionLevel: 'M',
      }),
    };
  }
}
