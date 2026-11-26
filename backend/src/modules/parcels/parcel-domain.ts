import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { TokenPayload } from '../auth/token/token.payload.js';
export const CURRENCIES = { ILS: 2, USD: 2, EUR: 2, JOD: 3 } as const;
/**
 * OD-13 (BR-002, BR-093): no parcels, COD or settlements before the merchant is ACTIVE,
 * i.e. its OWNER accepted the invitation and agreement (or it predates OD-13).
 */
export function assertActiveMerchant(merchant: { activationStatus: string }) {
  if (merchant.activationStatus !== 'ACTIVE')
    throw new ConflictException(
      'Merchant is pending activation: its owner must accept the invitation and agreement',
    );
}
export type Currency = keyof typeof CURRENCIES;
export const TRANSITIONS: Record<string, readonly string[]> = {
  CREATED: ['RECEIVED_FROM_MERCHANT', 'CANCELLED'],
  RECEIVED_FROM_MERCHANT: ['AT_WAREHOUSE', 'ASSIGNED', 'RETURN_IN_PROGRESS'],
  AT_WAREHOUSE: ['ASSIGNED', 'RETURN_IN_PROGRESS'],
  ASSIGNED: ['OUT_FOR_DELIVERY', 'AT_WAREHOUSE', 'RETURN_IN_PROGRESS'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED_DELIVERY', 'RETURN_IN_PROGRESS'],
  FAILED_DELIVERY: ['OUT_FOR_DELIVERY', 'AT_WAREHOUSE', 'RETURN_IN_PROGRESS'],
  RETURN_IN_PROGRESS: ['RETURNED_TO_WAREHOUSE'],
  RETURNED_TO_WAREHOUSE: ['RETURNED_TO_MERCHANT'],
  DELIVERED: [],
  RETURNED_TO_MERCHANT: [],
  CANCELLED: [],
  READY_FOR_DISPATCH: ['AT_WAREHOUSE'],
  PICKED_UP: ['AT_WAREHOUSE'],
  RESCHEDULED: ['AT_WAREHOUSE'],
  ON_HOLD: ['AT_WAREHOUSE'],
  RETURNED: [],
};
/**
 * Every parcel status belongs to exactly one dashboard bucket, so the buckets
 * always add up to the total. Legacy statuses fold into their nearest bucket.
 */
export const BUCKETS = [
  'new',
  'atWarehouse',
  'assigned',
  'outForDelivery',
  'delivered',
  'failedDeliveries',
  'pendingReturns',
  'returnedToMerchant',
  'cancelled',
] as const;
export type StatusBucket = (typeof BUCKETS)[number];
export const STATUS_BUCKETS: Record<StatusBucket, readonly string[]> = {
  new: ['CREATED'],
  atWarehouse: [
    'RECEIVED_FROM_MERCHANT',
    'AT_WAREHOUSE',
    'READY_FOR_DISPATCH',
    'PICKED_UP',
    'RESCHEDULED',
    'ON_HOLD',
  ],
  assigned: ['ASSIGNED'],
  outForDelivery: ['OUT_FOR_DELIVERY'],
  delivered: ['DELIVERED'],
  failedDeliveries: ['FAILED_DELIVERY'],
  pendingReturns: ['RETURN_IN_PROGRESS', 'RETURNED_TO_WAREHOUSE'],
  returnedToMerchant: ['RETURNED_TO_MERCHANT', 'RETURNED'],
  cancelled: ['CANCELLED'],
};
export function statusBuckets(
  rows: readonly { status: string; count: number }[],
): Record<StatusBucket, number> {
  const sum = (bucket: StatusBucket) =>
    rows
      .filter((row) => STATUS_BUCKETS[bucket].includes(row.status))
      .reduce((total, row) => total + row.count, 0);
  return {
    new: sum('new'),
    atWarehouse: sum('atWarehouse'),
    assigned: sum('assigned'),
    outForDelivery: sum('outForDelivery'),
    delivered: sum('delivered'),
    failedDeliveries: sum('failedDeliveries'),
    pendingReturns: sum('pendingReturns'),
    returnedToMerchant: sum('returnedToMerchant'),
    cancelled: sum('cancelled'),
  };
}
export function money(value: string, currency: string, signed = false): bigint {
  const precision = Object.entries(CURRENCIES).find(
    ([key]) => key === currency,
  )?.[1];
  if (
    precision === undefined ||
    !new RegExp(
      `^${signed ? '-?' : ''}\\d{1,14}(?:\\.\\d{1,${precision}})?$`,
    ).test(value)
  )
    throw new BadRequestException('Invalid monetary amount or currency');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const result =
    BigInt(whole) * 10n ** BigInt(precision) +
    BigInt(fraction.padEnd(precision, '0'));
  return negative ? -result : result;
}
export function amount(value: bigint, currency: string): string {
  const precision = Object.entries(CURRENCIES).find(
    ([key]) => key === currency,
  )?.[1];
  if (precision === undefined)
    throw new BadRequestException('Unsupported currency');
  const absolute = value < 0n ? -value : value,
    scale = 10n ** BigInt(precision);
  return `${value < 0n ? '-' : ''}${absolute / scale}.${(absolute % scale).toString().padStart(precision, '0')}`;
}
export function collectionTotal(
  goods: bigint,
  delivery: bigint,
  service: bigint,
  payer: string,
  pricingMode = 'LEGACY',
) {
  return (
    goods +
    (pricingMode !== 'FINAL_INCLUSIVE' && payer === 'CUSTOMER'
      ? delivery + service
      : 0n)
  );
}
export function assertFullAmount(actual: bigint, expected: bigint) {
  if (actual !== expected || actual <= 0n)
    throw new BadRequestException('Only the exact full amount is supported');
}
export function assertTransition(from: string, to: string) {
  if (!TRANSITIONS[from]?.includes(to))
    throw new ConflictException('Invalid parcel transition');
}
export function assertRevision(actual: number, expected: number) {
  if (actual !== expected)
    throw new ConflictException('Record changed. Reload before retrying');
}
export function capabilities(role: string) {
  const admin = role === 'COMPANY_ADMIN',
    operations = admin || role === 'OPERATIONS',
    warehouse = operations || role === 'WAREHOUSE',
    finance = admin || role === 'ACCOUNTANT';
  return {
    view: finance || warehouse,
    manageMerchants: admin,
    manageParcels: operations,
    manageReturns: operations,
    warehouseOperations: warehouse,
    advanceReturns: warehouse,
    viewPickups: warehouse,
    reviewPickups: operations,
    receivePickups: warehouse,
    manageDrivers: operations,
    viewWarehouses: warehouse,
    manageWarehouses: admin,
    manageVehicles: admin,
    viewVehicles: operations,
    collect: finance,
    remit: finance,
    viewFinance: finance,
    createSettlements: finance,
    approveSettlements: admin,
    paySettlements: finance,
  };
}
export type Capability = keyof ReturnType<typeof capabilities>;
export function company(actor: TokenPayload, capability: Capability = 'view') {
  if (!actor?.sub) throw new UnauthorizedException();
  if (!actor.orgId || !capabilities(actor.role)[capability])
    throw new ForbiddenException('Operation is not permitted');
  return actor.orgId;
}
export function settlementTotals(
  lines: readonly { kind: string; amountMinor: bigint }[],
) {
  let grossCollected = 0n,
    deliveryFees = 0n,
    returnFees = 0n,
    adjustments = 0n,
    netPayable = 0n;
  for (const line of lines) {
    netPayable += line.amountMinor;
    if (line.kind === 'GOODS') grossCollected += line.amountMinor;
    else if (line.kind === 'DELIVERY_FEE') deliveryFees -= line.amountMinor;
    else if (line.kind === 'RETURN_FEE') returnFees -= line.amountMinor;
    else adjustments += line.amountMinor;
  }
  return { grossCollected, deliveryFees, returnFees, adjustments, netPayable };
}
