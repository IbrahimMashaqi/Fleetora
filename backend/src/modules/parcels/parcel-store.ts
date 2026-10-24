import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Temporal } from 'temporal-polyfill';
import { PrismaService } from '../prisma/prisma.service.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import {
  amount,
  collectionTotal,
  company,
  type Capability,
} from './parcel-domain.js';
import type { PageDto } from './parcel.dto.js';
export type ParcelTransaction = Parameters<
  Parameters<PrismaService['db']['transaction']>[0]
>[0];
export type ParcelOrm = ParcelTransaction['orm']['public'];
export type ParcelRow = NonNullable<
  Awaited<ReturnType<ParcelOrm['Shipment']['first']>>
>;
// Keep nested SQL JSON below PostgreSQL's 100-argument limit and allowlist summaries.
export const RETURN_PARCEL_FIELDS = [
  'id','companyId','merchantId','trackingNumber','recipientName','recipientPhone',
  'city','destination','currency','codMinor','deliveryFeeMinor','serviceFeeMinor',
  'returnFeeMinor','returnFeePolicy','feePayer','status','revision','custody','workerId',
  'locationLabel','locationSource','locationUpdatedAt','createdAt','updatedAt',
  'pricingMode','collectionMode','pickupMethod','attemptCount','description','pieces',
] as const;
export const now = () => Temporal.Now.instant();
export function instant(value: string, endOfDay = false) {
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const date = Temporal.PlainDate.from(value);
      const start = Temporal.Instant.from(`${date.toString()}T00:00:00Z`);
      return endOfDay
        ? start.add({ hours: 24 }).subtract({ microseconds: 1 })
        : start;
    }
    return Temporal.Instant.from(value);
  } catch {
    throw new BadRequestException('Invalid date');
  }
}
export function dateRange(input: { from?: string; to?: string }) {
  const from = input.from ? instant(input.from) : undefined,
    to = input.to ? instant(input.to, true) : undefined;
  if (from && to && Temporal.Instant.compare(from, to) > 0)
    throw new BadRequestException('Invalid date range');
  return { from, to };
}
export function wire<T extends { currency: string }>(row: T) {
  const names: Record<string, string> = {
    codMinor: 'codAmount',
    pricingDiscountMinor: 'pricingDiscount',
    declaredValueMinor: 'declaredValue',
    deliveryFeeMinor: 'deliveryFee',
    returnFeeMinor: 'returnFee',
    serviceFeeMinor: 'serviceFee',
    amountMinor: 'amount',
    goodsMinor: 'goodsAmount',
    grossCollectedMinor: 'grossCollected',
    deliveryFeesMinor: 'deliveryFees',
    returnFeesMinor: 'returnFees',
    adjustmentsMinor: 'adjustments',
    netPayableMinor: 'netPayable',
  };
  const result: Record<string, unknown> = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      names[key] ?? key,
      typeof value === 'bigint' ? amount(value, row.currency) : value,
    ]),
  );
  if (
    'codMinor' in row &&
    typeof row.codMinor === 'bigint' &&
    'deliveryFeeMinor' in row &&
    typeof row.deliveryFeeMinor === 'bigint' &&
    'serviceFeeMinor' in row &&
    typeof row.serviceFeeMinor === 'bigint' &&
    'feePayer' in row &&
    typeof row.feePayer === 'string'
  ) {
    const total = collectionTotal(
        row.codMinor,
        row.deliveryFeeMinor,
        row.serviceFeeMinor,
        row.feePayer,
        'pricingMode' in row && typeof row.pricingMode === 'string' ? row.pricingMode : 'LEGACY',
      );
    result.expectedCustomerTotal = amount(total, row.currency);
    result.collectionRequired = total > 0n;
  }
  return result;
}
export function page<T>(companyId: string, items: T[], query: PageDto) {
  return {
    companyId,
    items: items.slice(0, query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    hasNext: items.length > query.pageSize,
  };
}
export function pattern(search: string) {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
}
@Injectable()
export class ParcelStore {
  constructor(@Inject(PrismaService) readonly prisma: PrismaService) {}
  get orm() {
    return this.prisma.db.orm.public;
  }
  async write<T>(
    actor: TokenPayload,
    capability: Capability,
    operation: (tx: ParcelTransaction, companyId: string) => Promise<T>,
  ): Promise<T> {
    const companyId = company(actor, capability);
    try {
      return await this.prisma.db.transaction(async (tx) => {
        await tx.execute(
          this.prisma.db.raw
            .sql`SELECT "id" FROM "companies" WHERE "id"=${companyId} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        await tx.execute(
          this.prisma.db.raw
            .sql`SELECT "id" FROM "users" WHERE "id"=${actor.sub} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        const [user, tenant] = await Promise.all([
          tx.orm.public.User.where({ id: actor.sub })
            .select('id', 'role', 'companyId', 'isActive', 'isEmailVerified')
            .first(),
          tx.orm.public.Company.where({ id: companyId })
            .select('id', 'suspended')
            .first(),
        ]);
        if (
          !user?.isActive ||
          !user.isEmailVerified ||
          !tenant ||
          tenant.suspended
        )
          throw new UnauthorizedException();
        if (user.companyId !== companyId || user.role !== actor.role)
          throw new ForbiddenException('Session context changed');
        company({ ...actor, role: user.role }, capability);
        return operation(tx, companyId);
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      if (
        error &&
        typeof error === 'object' &&
        (('code' in error &&
          ['23505', 'P2002', '23503', 'P2003', '40001', '40P01'].includes(
            String(error.code),
          )) ||
          ('sqlState' in error &&
            ['23505', '23503', '40001', '40P01'].includes(
              String(error.sqlState),
            )))
      )
        throw new ConflictException(
          'Record changed or conflicts with an existing operation',
        );
      // Database diagnostics may contain recipient data and query values.
      throw new InternalServerErrorException(
        'Operation could not be completed',
        { cause: error },
      );
    }
  }
  async monetary(
    actor: TokenPayload,
    capability: Capability,
    key: string,
    action: string,
    input: object,
    operation: (tx: ParcelTransaction, companyId: string) => Promise<string>,
  ): Promise<string> {
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          action,
          actorId: actor.sub,
          input: Object.entries(input).sort(([a], [b]) => a.localeCompare(b)),
        }),
      )
      .digest('hex');
    return this.write(actor, capability, async (tx, companyId) => {
      const previous = await tx.orm.public.MonetaryRequest.where({
        companyId,
        key,
      }).first();
      if (previous) {
        if (previous.payloadHash !== payloadHash)
          throw new ConflictException(
            'Idempotency key belongs to a different request',
          );
        return previous.resultId;
      }
      const resultId = await operation(tx, companyId);
      await tx.orm.public.MonetaryRequest.create({
        companyId,
        key,
        payloadHash,
        resultId,
      });
      return resultId;
    });
  }
  async event(
    tx: ParcelTransaction,
    parcel: ParcelRow,
    actor: TokenPayload,
    event: string,
    note?: string,
    fromStatus?: string,
    driverChange?: {
      oldWorkerId: string | null;
      newWorkerId: string | null;
      oldWorkerName: string | null;
      newWorkerName: string | null;
    },
  ) {
    await tx.orm.public.ShipmentHistory.create({
      shipmentId: parcel.id,
      event,
      actorId: actor.sub,
      fromStatus: fromStatus ?? parcel.status,
      toStatus: parcel.status,
      note: note ?? null,
      custody: parcel.custody,
      locationLabel: parcel.locationLabel,
      ...driverChange,
    });
  }
}
