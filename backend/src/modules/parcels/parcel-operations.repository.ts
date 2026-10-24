import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, or } from '@prisma/orm-postgres/orm-client';
import { shipmentFilter } from './parcel-filters.js';
import { randomUUID } from 'node:crypto';
import type { TokenPayload } from '../auth/token/token.payload.js';
import {
  assertRevision,
  assertTransition,
  capabilities,
  company,
  money,
  TRANSITIONS,
} from './parcel-domain.js';
import {
  ParcelStore,
  dateRange,
  instant,
  now,
  page,
  pattern,
  wire,
  type ParcelTransaction,
  type ParcelRow,
  RETURN_PARCEL_FIELDS,
} from './parcel-store.js';
import { ParcelLedger } from './parcel-ledger.js';
import type {
  AssignmentDto,
  AttemptDto,
  LocationDto,
  MerchantEditDto,
  MerchantInputDto,
  PageDto,
  ParcelEditDto,
  ParcelInputDto,
  ReturnInputDto,
  TransitionDto,
} from './parcel.dto.js';
function status(value: string): asserts value is ParcelRow['status'] {
  if (!Object.hasOwn(TRANSITIONS, value))
    throw new BadRequestException('Invalid parcel status');
}
function coordinates(
  latitude: number | undefined,
  longitude: number | undefined,
) {
  if ((latitude == null) !== (longitude == null))
    throw new BadRequestException('Both coordinates are required');
}
@Injectable()
export class ParcelOperationsRepository {
  constructor(
    @Inject(ParcelStore) private readonly store: ParcelStore,
    @Inject(ParcelLedger) private readonly ledger: ParcelLedger,
  ) {}
  async merchants(actor: TokenPayload, q: PageDto) {
    const companyId = company(actor);
    let query = this.store.orm.Merchant.where({ companyId });
    if (q.search)
      query = query.where((m) =>
        or(
          m.name.ilike(pattern(q.search!)),
          m.phone.ilike(pattern(q.search!)),
          m.contactName.ilike(pattern(q.search!)),
        ),
      );
    if (q.active !== undefined) query = query.where({ active: q.active });
    return page(
      companyId,
      (
        await query
          .orderBy([(m) => m.name.asc(), (m) => m.id.asc()])
          .offset((q.page - 1) * q.pageSize)
          .limit(q.pageSize + 1)
          .all()
      ).map(wire),
      q,
    );
  }
  async merchant(actor: TokenPayload, id: string) {
    const companyId = company(actor);
    const merchant = await this.store.orm.Merchant.where({
      companyId,
      id,
    }).first();
    if (!merchant) throw new NotFoundException('Merchant not found');
    const rows = await this.store.prisma.db.runtime().query(
      this.store.prisma.db.raw
        .sql`SELECT count(*)::int AS total,count(*) FILTER (WHERE status='DELIVERED')::int AS delivered,count(*) FILTER (WHERE status IN ('RETURN_IN_PROGRESS','RETURNED_TO_WAREHOUSE','RETURNED_TO_MERCHANT','RETURNED'))::int AS returns FROM shipments WHERE "companyId"=${companyId} AND "merchantId"=${id}`
        .returnsRow({
          total: 'pg/int4@1',
          delivered: 'pg/int4@1',
          returns: 'pg/int4@1',
        })
        .build(),
    );
    return {
      companyId,
      merchant: wire(merchant),
      statistics: rows[0],
      balances: await this.ledger.balances(companyId, id),
    };
  }
  async saveMerchant(
    actor: TokenPayload,
    input: MerchantInputDto | MerchantEditDto,
    id?: string,
  ) {
    coordinates(input.latitude, input.longitude);
    const result = await this.store.write(
      actor,
      'manageMerchants',
      async (tx, companyId) => {
        const data = {
          name: input.name,
          contactName: input.contactName,
          phone: input.phone,
          secondaryPhone: input.secondaryPhone ?? null,
          pickupAddress: input.pickupAddress,
          city: input.city,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          notes: input.notes ?? null,
          active: input.active ?? true,
          currency: input.currency,
          deliveryFeeMinor: money(input.deliveryFee, input.currency),
          returnFeeMinor: money(input.returnFee, input.currency),
          returnFeePolicy: input.returnFeePolicy ?? 'ON_MERCHANT_HANDOFF',
          serviceFeeMinor: money(input.serviceFee, input.currency),
          feePayer: input.feePayer,
          paymentNotes: input.paymentNotes ?? null,
        };
        if (id) {
          const old = await tx.orm.public.Merchant.where({
            companyId,
            id,
          }).first();
          if (!old) throw new NotFoundException('Merchant not found');
          if (!('revision' in input))
            throw new BadRequestException('Revision required');
          assertRevision(old.revision, input.revision);
          await tx.orm.public.Merchant.where({
            companyId,
            id,
            revision: old.revision,
          }).update({ ...data, revision: old.revision + 1 });
          return id;
        }
        return (await tx.orm.public.Merchant.create({ companyId, ...data })).id;
      },
    );
    const response = await this.merchant(actor, result);
    return { companyId: response.companyId, merchant: response.merchant };
  }
  async drivers(actor: TokenPayload, q: PageDto) {
    const companyId = company(actor);
    let query = this.store.orm.Worker.where({ companyId });
    if (q.search)
      query = query.where((w) =>
        or(
          w.fullName.ilike(pattern(q.search!)),
          w.phone.ilike(pattern(q.search!)),
        ),
      );
    return page(
      companyId,
      await query
        .select('id', 'companyId', 'fullName', 'phone', 'status', 'vehicleId')
        .orderBy([(w) => w.fullName.asc(), (w) => w.id.asc()])
        .offset((q.page - 1) * q.pageSize)
        .limit(q.pageSize + 1)
        .all(),
      q,
    );
  }
  async parcels(actor: TokenPayload, q: PageDto) {
    const companyId = company(actor);
    dateRange(q);
    let query = this.store.orm.Shipment.where({ companyId });
    if (q.merchantId) query = query.where({ merchantId: q.merchantId });
    if (q.workerId) query = query.where({ workerId: q.workerId });
    if (q.city) query = query.where({ city: q.city });
    if (q.status) {
      status(q.status);
      query = query.where({ status: q.status });
    }
    if (q.search)
      query = query.where((s) =>
        or(
          s.trackingNumber.ilike(pattern(q.search!)),
          s.recipientName.ilike(pattern(q.search!)),
          s.recipientPhone.ilike(pattern(q.search!)),
          s.merchantReference.ilike(pattern(q.search!)),
          s.merchant.some((m) =>
            and(m.companyId.eq(companyId), m.name.ilike(pattern(q.search!))),
          ),
        ),
      );
    if (q.from) query = query.where((s) => s.createdAt.gte(instant(q.from!)));
    if (q.to) query = query.where((s) => s.createdAt.lte(instant(q.to!, true)));
    const ordered = query.orderBy([
      (s) => (q.direction === 'asc' ? s[q.sort].asc() : s[q.sort].desc()),
      (s) => (q.direction === 'asc' ? s.id.asc() : s.id.desc()),
    ]);
    return page(
      companyId,
      (
        await ordered
          .offset((q.page - 1) * q.pageSize)
          .limit(q.pageSize + 1)
          .all()
      ).map(wire),
      q,
    );
  }
  async find(tx: ParcelTransaction, id: string, companyId: string) {
    const parcel = await tx.orm.public.Shipment.where({
      companyId,
      id,
    }).first();
    if (!parcel) throw new NotFoundException('Parcel not found');
    return parcel;
  }
  async details(actor: TokenPayload, id: string) {
    const companyId = company(actor);
    const parcel = await this.store.orm.Shipment.where({
      companyId,
      id,
    }).first();
    if (!parcel) throw new NotFoundException('Parcel not found');
    const [merchant, collection, returnRecord, events, attempts, worker] =
      await Promise.all([
        parcel.merchantId
          ? this.store.orm.Merchant.where({
              companyId,
              id: parcel.merchantId,
            }).first()
          : null,
        this.store.orm.CodCollection.where({ companyId, shipmentId: id })
          .include('remittance', (r) => r.where({ companyId }))
          .first(),
        this.store.orm.ParcelReturn.where({
          companyId,
          shipmentId: id,
        }).first(),
        this.store.orm.ShipmentHistory.where({ shipmentId: id })
          .where((h) => h.shipment.some((s) => s.companyId.eq(companyId)))
          .orderBy([(e) => e.occurredAt.desc(), (e) => e.id.desc()])
          .limit(100)
          .all(),
        this.store.orm.ParcelAttempt.where({ companyId, shipmentId: id })
          .orderBy([(e) => e.createdAt.desc(), (e) => e.id.desc()])
          .limit(100)
          .all(),
        parcel.workerId
          ? this.store.orm.Worker.where({ companyId, id: parcel.workerId })
              .select('id', 'fullName', 'phone', 'status')
              .first()
          : null,
      ]);
    return {
      companyId,
      parcel: wire(parcel),
      merchant: merchant ? wire(merchant) : null,
      collection: collection ? collectionWire(collection) : null,
      returnRecord,
      events,
      attempts,
      worker,
      allowedTransitions: TRANSITIONS[parcel.status] ?? [],
      capabilities: capabilities(actor.role),
    };
  }
  async events(actor: TokenPayload, id: string, q: PageDto) {
    const companyId = company(actor);
    if (
      !(await this.store.orm.Shipment.where({ companyId, id })
        .select('id')
        .first())
    )
      throw new NotFoundException('Parcel not found');
    return page(
      companyId,
      await this.store.orm.ShipmentHistory.where({ shipmentId: id })
        .where((h) => h.shipment.some((s) => s.companyId.eq(companyId)))
        .orderBy([(e) => e.occurredAt.desc(), (e) => e.id.desc()])
        .offset((q.page - 1) * q.pageSize)
        .limit(q.pageSize + 1)
        .all(),
      q,
    );
  }
  async saveParcel(
    actor: TokenPayload,
    input: ParcelInputDto | ParcelEditDto,
    id?: string,
  ) {
    coordinates(input.latitude, input.longitude);
    const result = await this.store.write(
      actor,
      'manageParcels',
      async (tx, companyId) => {
        const merchant = await tx.orm.public.Merchant.where({
          companyId,
          id: input.merchantId,
          active: true,
        }).first();
        if (!merchant) throw new NotFoundException('Active merchant not found');
        const old = id ? await this.find(tx, id, companyId) : null;
        if (old) {
          if (old.pricingMode === 'FINAL_INCLUSIVE')
            throw new ConflictException('Use the merchant pricing workflow to amend an inclusive-price parcel');
          if (old.status !== 'CREATED')
            throw new ConflictException('Only new parcels may be edited');
          if (!('revision' in input))
            throw new BadRequestException('Revision required');
          assertRevision(old.revision, input.revision);
        }
        const merchantChanged = !!old && old.merchantId !== merchant.id;
        if (
          merchantChanged &&
          (old.custody !== 'MERCHANT' ||
            old.locationSource !== 'MERCHANT_ADDRESS')
        )
          throw new ConflictException(
            'Merchant cannot be changed after an operational handoff',
          );
        // Existing snapshots stay fixed on edits. A new merchant selection snapshots that merchant's current terms.
        const terms = old?.merchantId === merchant.id ? old : merchant;
        const data = {
          merchantId: merchant.id,
          merchantReference: input.merchantReference ?? null,
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone,
          secondaryPhone: input.secondaryPhone ?? null,
          city: input.city,
          destination: input.destination,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          instructions: input.instructions ?? null,
          customerNotes: input.customerNotes ?? null,
          description: input.description,
          pieces: input.pieces,
          weight: input.weight ?? null,
          declaredValueMinor: input.declaredValue
            ? money(input.declaredValue, terms.currency)
            : null,
          codMinor: money(input.codAmount, terms.currency),
          deliveryFeeMinor: terms.deliveryFeeMinor,
          returnFeeMinor: terms.returnFeeMinor,
          returnFeePolicy: terms.returnFeePolicy,
          serviceFeeMinor: terms.serviceFeeMinor,
          currency: terms.currency,
          feePayer: terms.feePayer,
          notes: input.notes ?? null,
          scheduledAt: input.scheduledAt ? instant(input.scheduledAt) : null,
          priority: input.priority ?? ('NORMAL' as const),
          responsibleActorId: actor.sub,
          ...(merchantChanged
            ? {
                locationLabel: merchant.pickupAddress,
                locationSource: 'MERCHANT_ADDRESS',
                locationUpdatedAt: now(),
              }
            : {}),
        };
        let parcel: ParcelRow;
        if (old) {
          await tx.orm.public.Shipment.where({
            companyId,
            id: old.id,
            revision: old.revision,
          }).update({ ...data, revision: old.revision + 1 });
          parcel = await this.find(tx, old.id, companyId);
        } else
          parcel = await tx.orm.public.Shipment.create({
            companyId,
            requestedBy: actor.sub,
            trackingNumber: `FL-${randomUUID().replaceAll('-', '').toUpperCase()}`,
            locationLabel: merchant.pickupAddress,
            locationSource: 'MERCHANT_ADDRESS',
            locationUpdatedAt: now(),
            ...data,
          });
        await this.store.event(
          tx,
          parcel,
          actor,
          old ? 'PARCEL_EDITED' : 'PARCEL_CREATED',
        );
        return parcel.id;
      },
    );
    return this.parcelResult(actor, result);
  }
  async parcelResult(actor: TokenPayload, id: string) {
    const result = await this.details(actor, id);
    return { companyId: result.companyId, parcel: result.parcel };
  }
  async change(
    tx: ParcelTransaction,
    actor: TokenPayload,
    parcel: ParcelRow,
    target: string,
    note?: string,
    internal = false,
  ) {
    status(target);
    assertTransition(parcel.status, target);
    if (
      !internal &&
      [
        'ASSIGNED',
        'RETURN_IN_PROGRESS',
        'RETURNED_TO_WAREHOUSE',
        'RETURNED_TO_MERCHANT',
      ].includes(target)
    )
      throw new BadRequestException(
        'Use the dedicated assignment or return action',
      );
    if (
      ['OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY'].includes(target) &&
      !parcel.workerId
    )
      throw new ConflictException('Assign a company driver first');
    if (target === 'FAILED_DELIVERY' && !note?.trim())
      throw new BadRequestException('Failure reason is required');
    const custody =
      target === 'DELIVERED'
        ? 'CUSTOMER'
        : target === 'RETURNED_TO_MERCHANT'
          ? 'MERCHANT'
          : ['AT_WAREHOUSE', 'RETURNED_TO_WAREHOUSE'].includes(target)
            ? 'WAREHOUSE'
            : target === 'OUT_FOR_DELIVERY'
              ? 'DRIVER'
              : target === 'RECEIVED_FROM_MERCHANT'
                ? 'COMPANY'
                : parcel.custody;
    const locationLabel =
      target === 'DELIVERED'
        ? parcel.destination
        : target === 'OUT_FOR_DELIVERY'
          ? 'Assigned driver custody'
          : target === 'RETURNED_TO_MERCHANT'
            ? 'Verified merchant handoff'
            : target === 'RECEIVED_FROM_MERCHANT'
              ? 'Received from merchant'
              : ['AT_WAREHOUSE', 'RETURNED_TO_WAREHOUSE'].includes(target)
                ? 'Company warehouse'
                : parcel.locationLabel;
    await tx.orm.public.Shipment.where({
      id: parcel.id,
      companyId: parcel.companyId,
      revision: parcel.revision,
    }).update({
      status: target,
      revision: parcel.revision + 1,
      custody,
      locationLabel,
      locationSource:
        target === 'DELIVERED'
          ? 'VERIFIED_DELIVERY'
          : target === 'RETURNED_TO_MERCHANT'
            ? 'VERIFIED_RETURN_HANDOFF'
            : 'OPERATIONAL_EVENT',
      locationUpdatedAt: now(),
      responsibleActorId: actor.sub,
      ...(target === 'DELIVERED' ? { deliveredAt: now() } : {}),
      ...(target === 'RETURNED_TO_MERCHANT' ? { returnedAt: now() } : {}),
    });
    const updated = await this.find(tx, parcel.id, parcel.companyId);
    await this.store.event(
      tx,
      updated,
      actor,
      'STATUS_CHANGED',
      note,
      parcel.status,
    );
    if (target === 'DELIVERED')
      await this.ledger.charge(tx, updated, actor, 'DELIVERY_FEE');
    if (target === 'RETURNED_TO_MERCHANT')
      await this.ledger.charge(tx, updated, actor, 'RETURN_FEE');
    return updated;
  }
  async transition(actor: TokenPayload, id: string, input: TransitionDto) {
    await this.store.write(actor, 'manageParcels', async (tx, companyId) => {
      const parcel = await this.find(tx, id, companyId);
      assertRevision(parcel.revision, input.revision);
      if (input.status === 'DELIVERED' || input.status === 'FAILED_DELIVERY')
        await this.recordAttempt(
          tx,
          actor,
          parcel,
          input.status === 'DELIVERED' ? 'DELIVERED' : 'FAILED',
          input.status === 'FAILED_DELIVERY' ? input.note : undefined,
          input.note,
        );
      else await this.change(tx, actor, parcel, input.status, input.note);
    });
    return this.parcelResult(actor, id);
  }
  async assignment(actor: TokenPayload, id: string, input: AssignmentDto) {
    await this.store.write(actor, 'manageParcels', async (tx, companyId) => {
      const parcel = await this.find(tx, id, companyId);
      assertRevision(parcel.revision, input.revision);
      if (
        !['RECEIVED_FROM_MERCHANT', 'AT_WAREHOUSE', 'ASSIGNED', 'FAILED_DELIVERY'].includes(parcel.status)
      )
        throw new ConflictException('Parcel cannot be assigned in this state');
      if (parcel.custody === 'DRIVER' && parcel.workerId !== input.workerId)
        throw new ConflictException(
          'Record the current driver handback before reassigning the parcel',
        );
      const driver = await tx.orm.public.Worker.where({
        companyId,
        id: input.workerId,
      })
        .select('id', 'status', 'fullName')
        .first();
      if (!driver || driver.status === 'SUSPENDED')
        throw new NotFoundException('Eligible company driver not found');
      const previousDriver = parcel.workerId
        ? await tx.orm.public.Worker.where({ companyId, id: parcel.workerId })
            .select('id', 'fullName')
            .first()
        : null;
      await tx.orm.public.Shipment.where({
        companyId,
        id,
        revision: parcel.revision,
      }).update({
        workerId: driver.id,
        status: 'ASSIGNED',
        revision: parcel.revision + 1,
        responsibleActorId: actor.sub,
      });
      await this.store.event(
        tx,
        await this.find(tx, id, companyId),
        actor,
        'DRIVER_ASSIGNED',
        input.note,
        parcel.status,
        {
          oldWorkerId: parcel.workerId,
          newWorkerId: driver.id,
          oldWorkerName: previousDriver?.fullName ?? null,
          newWorkerName: driver.fullName,
        },
      );
    });
    return this.parcelResult(actor, id);
  }
  async attempt(actor: TokenPayload, id: string, input: AttemptDto) {
    await this.store.write(actor, 'manageParcels', async (tx, companyId) => {
      const parcel = await this.find(tx, id, companyId);
      assertRevision(parcel.revision, input.revision);
      await this.recordAttempt(
        tx,
        actor,
        parcel,
        input.outcome,
        input.reason,
        input.note,
      );
    });
    return this.parcelResult(actor, id);
  }
  private async recordAttempt(
    tx: ParcelTransaction,
    actor: TokenPayload,
    parcel: ParcelRow,
    outcome: 'FAILED' | 'DELIVERED',
    reason?: string,
    note?: string,
  ) {
    if (outcome === 'FAILED' && !reason?.trim())
      throw new BadRequestException('Failure reason is required');
    const target = outcome === 'DELIVERED' ? 'DELIVERED' : 'FAILED_DELIVERY';
    assertTransition(parcel.status, target);
    await tx.orm.public.ParcelAttempt.create({
      companyId: parcel.companyId,
      shipmentId: parcel.id,
      outcome,
      reason: reason ?? null,
      note: note ?? null,
      actorId: actor.sub,
    });
    await tx.orm.public.Shipment.where({
      companyId: parcel.companyId,
      id: parcel.id,
    }).update({ attemptCount: parcel.attemptCount + 1 });
    await this.change(tx, actor, parcel, target, reason ?? note);
  }
  async location(actor: TokenPayload, id: string, input: LocationDto) {
    await this.store.write(actor, 'manageParcels', async (tx, companyId) => {
      const parcel = await this.find(tx, id, companyId);
      assertRevision(parcel.revision, input.revision);
      if (
        ['DELIVERED', 'RETURNED_TO_MERCHANT', 'CANCELLED', 'RETURNED'].includes(
          parcel.status,
        )
      )
        throw new ConflictException('Terminal parcel custody is fixed');
      if (input.custody === 'CUSTOMER' || input.custody === 'MERCHANT')
        throw new BadRequestException(
          'Use completion or merchant return for this custody',
        );
      if (input.custody === 'DRIVER' && !parcel.workerId)
        throw new ConflictException('Assign a driver first');
      if (
        input.custody === 'WAREHOUSE' &&
        ![
          'AT_WAREHOUSE',
          'RETURNED_TO_WAREHOUSE',
          'ASSIGNED',
          'FAILED_DELIVERY',
          'RETURN_IN_PROGRESS',
        ].includes(parcel.status)
      )
        throw new ConflictException('Record warehouse receipt first');
      await tx.orm.public.Shipment.where({
        companyId,
        id,
        revision: parcel.revision,
      }).update({
        custody: input.custody,
        locationLabel: input.locationLabel,
        locationSource: input.locationSource,
        locationUpdatedAt: now(),
        responsibleActorId: actor.sub,
        revision: parcel.revision + 1,
      });
      await this.store.event(
        tx,
        await this.find(tx, id, companyId),
        actor,
        'CUSTODY_RECORDED',
        input.note,
      );
    });
    return this.parcelResult(actor, id);
  }
  async returns(actor: TokenPayload, q: PageDto) {
    const companyId = company(actor);
    dateRange(q);
    let query = this.store.orm.ParcelReturn.where({ companyId });
    if (q.status) query = query.where({ status: q.status });
    if (q.reason) query = query.where({ reason: q.reason });
    query = query.where((r) =>
      r.shipment.some(
        shipmentFilter(companyId, { ...q, from: undefined, to: undefined }),
      ),
    );
    if (q.from) query = query.where((r) => r.createdAt.gte(instant(q.from!)));
    if (q.to) query = query.where((r) => r.createdAt.lte(instant(q.to!, true)));
    const rows = await query
      .include('shipment', (s) => s.where({ companyId }).select(...RETURN_PARCEL_FIELDS))
      .orderBy([(r) => r.createdAt.desc(), (r) => r.id.desc()])
      .offset((q.page - 1) * q.pageSize)
      .limit(q.pageSize + 1)
      .all();
    return page(
      companyId,
      rows.map(({ shipment, ...row }) => ({
        ...row,
        parcel: shipment ? wire(shipment) : null,
      })),
      q,
    );
  }
  async startReturn(actor: TokenPayload, input: ReturnInputDto) {
    await this.store.write(actor, 'manageReturns', async (tx, companyId) => {
      await this.startReturnIn(tx, actor, companyId, input);
    });
    return this.parcelResult(actor, input.parcelId);
  }
  // Shared transactional use case for approved merchant cancellation requests.
  async startReturnIn(tx: ParcelTransaction, actor: TokenPayload, companyId: string, input: ReturnInputDto) {
      const parcel = await this.find(tx, input.parcelId, companyId);
      assertRevision(parcel.revision, input.revision);
      if (input.reason === 'OTHER' && !input.note?.trim())
        throw new BadRequestException('Other return reason requires a note');
      await this.change(
        tx,
        actor,
        parcel,
        'RETURN_IN_PROGRESS',
        input.note ?? input.reason,
        true,
      );
      await tx.orm.public.ParcelReturn.create({
        companyId,
        shipmentId: parcel.id,
        reason: input.reason,
        note: input.note ?? null,
        status: 'RETURN_IN_PROGRESS',
        initiatedBy: actor.sub,
      });
  }
  async returnTransition(
    actor: TokenPayload,
    id: string,
    input: TransitionDto,
  ) {
    const parcelId = await this.store.write(
      actor,
      'manageReturns',
      async (tx, companyId) => {
        if (
          !['RETURNED_TO_WAREHOUSE', 'RETURNED_TO_MERCHANT'].includes(
            input.status,
          )
        )
          throw new BadRequestException('Invalid return stage');
        const record = await tx.orm.public.ParcelReturn.where({
          companyId,
          id,
        }).first();
        if (!record) throw new NotFoundException('Return not found');
        const parcel = await this.find(tx, record.shipmentId, companyId);
        assertRevision(parcel.revision, input.revision);
        await this.change(tx, actor, parcel, input.status, input.note, true);
        await tx.orm.public.ParcelReturn.where({ companyId, id }).update({
          status: input.status,
          ...(input.status === 'RETURNED_TO_WAREHOUSE'
            ? { warehouseAt: now() }
            : { merchantAt: now() }),
        });
        return parcel.id;
      },
    );
    return this.parcelResult(actor, parcelId);
  }
}
export function collectionWire(
  row: {
    currency: string;
    remittance?: {
      createdAt: unknown;
      actorId: string;
      method: string;
      reference: string | null;
      notes?: string | null;
    } | null;
  } & Record<string, unknown>,
): Record<string, unknown> {
  const { remittance, ...rest } = row;
  return {
    ...wire(rest),
    remittedAt: remittance?.createdAt ?? null,
    remittedBy: remittance?.actorId ?? null,
    remittanceMethod: remittance?.method ?? null,
    remittanceReference: remittance?.reference ?? null,
    remittanceNotes: remittance?.notes ?? null,
  };
}
