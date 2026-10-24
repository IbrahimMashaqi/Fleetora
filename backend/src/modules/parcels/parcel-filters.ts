import { BadRequestException } from '@nestjs/common';
import { and, or, type ModelAccessor } from '@prisma/orm-postgres/orm-client';
import type { Contract } from '../../prisma/generated/contract.d';
import { TRANSITIONS } from './parcel-domain.js';
import { dateRange, pattern, type ParcelRow } from './parcel-store.js';
import type { PageDto } from './parcel.dto.js';
export function validStatus(
  value: string,
): asserts value is ParcelRow['status'] {
  if (!Object.hasOwn(TRANSITIONS, value))
    throw new BadRequestException('Invalid parcel status');
}
export function shipmentFilter(
  companyId: string,
  q: Pick<
    PageDto,
    | 'merchantId'
    | 'workerId'
    | 'city'
    | 'status'
    | 'currency'
    | 'search'
    | 'from'
    | 'to'
  >,
) {
  const dates = dateRange(q);
  const parsedStatus = (
    value: string | undefined,
  ): ParcelRow['status'] | undefined => {
    if (value === undefined) return undefined;
    validStatus(value);
    return value;
  };
  const status = parsedStatus(q.status);
  return (s: ModelAccessor<Contract, 'Shipment', 'public'>) =>
    and(
      s.companyId.eq(companyId),
      ...(q.merchantId ? [s.merchantId.eq(q.merchantId)] : []),
      ...(q.workerId ? [s.workerId.eq(q.workerId)] : []),
      ...(q.city ? [s.city.eq(q.city)] : []),
      ...(status ? [s.status.eq(status)] : []),
      ...(q.currency ? [s.currency.eq(q.currency)] : []),
      ...(dates.from ? [s.createdAt.gte(dates.from)] : []),
      ...(dates.to ? [s.createdAt.lte(dates.to)] : []),
      ...(q.search
        ? [
            or(
              s.trackingNumber.ilike(pattern(q.search)),
              s.recipientName.ilike(pattern(q.search)),
              s.recipientPhone.ilike(pattern(q.search)),
              s.merchantReference.ilike(pattern(q.search)),
              s.merchant.some((m) =>
                and(
                  m.companyId.eq(companyId),
                  m.name.ilike(pattern(q.search!)),
                ),
              ),
            ),
          ]
        : []),
    );
}
