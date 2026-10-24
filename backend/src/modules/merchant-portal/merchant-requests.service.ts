import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { TokenPayload } from '../auth/token/token.payload.js';
import {
  ParcelStore,
  now,
  wire,
  type ParcelTransaction,
} from '../parcels/parcel-store.js';
import { assertRevision, amount } from '../parcels/parcel-domain.js';
import { ParcelOperationsRepository } from '../parcels/parcel-operations.repository.js';
import { MerchantPricingService } from '../merchant-pricing/merchant-pricing.service.js';
import { MerchantPortalStore } from './merchant-portal.store.js';
import { MerchantParcelsRepository } from './merchant-parcels.repository.js';
import {
  MerchantAmendmentDto,
  type MerchantCancellationRequestDto,
  type MerchantPageDto,
  type ReviewMerchantRequestDto,
} from './merchant-portal.dto.js';
import {
  requireCollectionMode,
  requireCoordinates,
  MerchantWorkflowError,
} from './merchant-portal.domain.js';
import { json } from './merchant-json.js';
type RequestRow = NonNullable<
  Awaited<
    ReturnType<
      ParcelTransaction['orm']['public']['MerchantParcelRequest']['first']
    >
  >
>;
const amendable = [
  'RECEIVED_FROM_MERCHANT',
  'AT_WAREHOUSE',
  'ASSIGNED',
  'OUT_FOR_DELIVERY',
  'FAILED_DELIVERY',
];
@Injectable()
export class MerchantRequestsService {
  constructor(
    @Inject(MerchantPortalStore) private readonly store: MerchantPortalStore,
    @Inject(ParcelStore) private readonly company: ParcelStore,
    @Inject(MerchantParcelsRepository)
    private readonly parcels: MerchantParcelsRepository,
    @Inject(MerchantPricingService)
    private readonly pricing: MerchantPricingService,
    @Inject(ParcelOperationsRepository)
    private readonly operations: ParcelOperationsRepository,
  ) {}
  private eligibility(parcel: { status: string; custody: string }) {
    if (!amendable.includes(parcel.status) || parcel.custody === 'MERCHANT')
      throw new ConflictException(
        'Only received active parcels support company-reviewed requests',
      );
  }
  async create(
    actor: TokenPayload,
    id: string,
    input: MerchantAmendmentDto | MerchantCancellationRequestDto,
    kind: 'AMEND' | 'CANCEL',
  ) {
    const requestId = await this.store.write(
      actor,
      kind === 'AMEND' ? 'PARCEL_EDIT' : 'PARCEL_CANCEL',
      (tx, context) =>
        this.store.idempotent(
          tx,
          context,
          input.idempotencyKey,
          `${kind}_REQUEST:${id}`,
          input,
          async () => {
            const parcel = await this.parcels.find(context, id, tx);
            this.eligibility(parcel);
            assertRevision(parcel.revision, input.revision);
            if (kind === 'AMEND') {
              if (!('zoneId' in input))
                throw new BadRequestException('Amendment details are required');
              await this.quote(
                tx,
                context.companyId,
                context.merchantId,
                input,
              );
            }
            const request = await tx.orm.public.MerchantParcelRequest.create({
              companyId: context.companyId,
              merchantId: context.merchantId,
              shipmentId: id,
              kind,
              parcelRevision: parcel.revision,
              proposed: json(input),
              previous: json(wire(parcel)),
              reason: input.reason,
              requestedBy: context.userId,
            });
            await tx.orm.public.ShipmentHistory.create({
              shipmentId: id,
              actorId: context.userId,
              event: `MERCHANT_${kind}_REQUESTED`,
              fromStatus: parcel.status,
              toStatus: parcel.status,
              custody: parcel.custody,
              note: JSON.stringify({
                requestId: request.id,
                reason: input.reason,
              }),
            });
            return request.id;
          },
        ),
    );
    const context = await this.store.access.resolve(
      actor,
      kind === 'AMEND' ? 'PARCEL_EDIT' : 'PARCEL_CANCEL',
    );
    return {
      request: await this.store.orm.MerchantParcelRequest.where({
        id: requestId,
        companyId: context.companyId,
        merchantId: context.merchantId,
      }).first(),
    };
  }
  async merchantList(actor: TokenPayload, shipmentId: string) {
    const context = await this.store.access.resolve(actor, 'PARCEL_VIEW');
    await this.parcels.find(context, shipmentId);
    return {
      items: await this.store.orm.MerchantParcelRequest.where({
        companyId: context.companyId,
        merchantId: context.merchantId,
        shipmentId,
      })
        .orderBy((r) => r.createdAt.desc())
        .limit(50)
        .all(),
    };
  }
  async list(actor: TokenPayload, q: MerchantPageDto) {
    return this.company.write(actor, 'manageParcels', async (tx, companyId) => {
      const rows = await tx.orm.public.MerchantParcelRequest.where({
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
  private async find(tx: ParcelTransaction, companyId: string, id: string) {
    const request = await tx.orm.public.MerchantParcelRequest.where({
      companyId,
      id,
    }).first();
    if (!request) throw new NotFoundException('Merchant request not found');
    return request;
  }
  private async input(request: RequestRow) {
    const input = plainToInstance(MerchantAmendmentDto, request.proposed);
    if (
      (await validate(input, { whitelist: true, forbidNonWhitelisted: true }))
        .length
    )
      throw new ConflictException('Stored amendment is invalid');
    return input;
  }
  private async quote(
    tx: ParcelTransaction,
    companyId: string,
    merchantId: string,
    input: MerchantAmendmentDto,
    expected?: string,
  ) {
    const quote = await this.pricing.quote(
      companyId,
      merchantId,
      input.zoneId,
      input.finalCustomerAmount,
      tx,
    );
    if (input.city !== quote.preview.city)
      throw new BadRequestException('Delivery city must match the zone');
    if (quote.preview.pricingVersion !== (expected ?? input.pricingVersion))
      throw new ConflictException(
        'Pricing changed; review a fresh financial preview',
      );
    try {
      requireCollectionMode(quote.snapshot.codMinor, input.collectionMode);
      requireCoordinates(input.latitude, input.longitude);
    } catch (error) {
      if (error instanceof MerchantWorkflowError)
        throw new BadRequestException(error.message);
      throw error;
    }
    return quote;
  }
  async preview(actor: TokenPayload, id: string) {
    return this.company.write(actor, 'manageParcels', async (tx, companyId) => {
      const request = await this.find(tx, companyId, id),
        parcel = await this.operations.find(tx, request.shipmentId, companyId);
      if (request.status !== 'REQUESTED')
        throw new ConflictException('Request already reviewed');
      let pricing:
        Awaited<ReturnType<MerchantPricingService['quote']>>['preview'] | null =
        null;
      let pricingUnavailable = false;
      if (request.kind === 'AMEND') {
        const proposal = await this.input(request);
        try {
          pricing = (
            await this.pricing.quote(
              companyId,
              request.merchantId,
              proposal.zoneId,
              proposal.finalCustomerAmount,
              tx,
            )
          ).preview;
        } catch (error) {
          if (
            error instanceof BadRequestException ||
            error instanceof NotFoundException
          )
            pricingUnavailable = true;
          else throw error;
        }
      }
      return {
        companyId,
        request,
        parcel: wire(parcel),
        pricing,
        pricingUnavailable,
        canApprove:
          !pricingUnavailable &&
          parcel.revision === request.parcelRevision &&
          amendable.includes(parcel.status) &&
          parcel.custody !== 'MERCHANT',
        currency: parcel.currency,
        returnFee: amount(
          parcel.returnFeePolicy === 'NONE' ? 0n : parcel.returnFeeMinor,
          parcel.currency,
        ),
        previousFee: amount(parcel.deliveryFeeMinor, parcel.currency),
        proposedFee: pricing?.deliveryFee ?? null,
        parcelRevision: parcel.revision,
      };
    });
  }
  async review(
    actor: TokenPayload,
    id: string,
    input: ReviewMerchantRequestDto,
  ) {
    const companyId = await this.company.write(
      actor,
      'manageParcels',
      async (tx, companyId) => {
        const request = await this.find(tx, companyId, id),
          parcel = await this.operations.find(
            tx,
            request.shipmentId,
            companyId,
          );
        if (request.status !== 'REQUESTED')
          throw new ConflictException('Request already reviewed');
        assertRevision(parcel.revision, input.parcelRevision);
        if (input.action === 'APPROVE') {
          this.eligibility(parcel);
          assertRevision(parcel.revision, request.parcelRevision);
          if (request.kind === 'CANCEL')
            await this.operations.startReturnIn(tx, actor, companyId, {
              parcelId: parcel.id,
              revision: parcel.revision,
              reason: 'MERCHANT_REQUESTED',
              note: request.reason,
            });
          else {
            if (!input.pricingVersion)
              throw new BadRequestException(
                'Financial preview confirmation is required',
              );
            const proposal = await this.input(request),
              quote = await this.quote(
                tx,
                companyId,
                request.merchantId,
                proposal,
                input.pricingVersion,
              );
            await this.parcels.save(
              tx,
              { companyId, merchantId: request.merchantId, userId: actor.sub },
              proposal,
              quote.snapshot,
              parcel,
            );
          }
        }
        await tx.orm.public.MerchantParcelRequest.where({
          id,
          companyId,
          status: 'REQUESTED',
        }).update({
          status: input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          reviewedBy: actor.sub,
          reviewedAt: now(),
          reviewReason: input.reason,
        });
        await tx.orm.public.ShipmentHistory.create({
          shipmentId: parcel.id,
          actorId: actor.sub,
          event: `MERCHANT_REQUEST_${input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED'}`,
          note: JSON.stringify({
            requestId: id,
            reason: input.reason,
            previous: request.previous,
            proposed: request.proposed,
          }),
          custody: parcel.custody,
        });
        return companyId;
      },
    );
    return { companyId, reviewed: true };
  }
}
