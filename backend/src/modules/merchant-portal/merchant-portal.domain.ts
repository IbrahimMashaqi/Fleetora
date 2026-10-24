import { Temporal } from 'temporal-polyfill';
export class MerchantWorkflowError extends Error {}
export function requireCollectionMode(amount: bigint, mode: 'COD' | 'PREPAID') {
  if ((mode === 'PREPAID' && amount !== 0n) || (mode === 'COD' && amount <= 0n))
    throw new MerchantWorkflowError(
      'Prepaid parcels require zero customer payment; COD parcels require a positive amount',
    );
}
export function requireUnreceived(parcel: { status: string; custody: string }) {
  if (parcel.status !== 'CREATED' || parcel.custody !== 'MERCHANT')
    throw new MerchantWorkflowError(
      'Parcel has been received; company approval is required for amendments or cancellation',
    );
}
export function requireCoordinates(latitude?: number, longitude?: number) {
  if ((latitude === undefined) !== (longitude === undefined))
    throw new MerchantWorkflowError('Both coordinates are required');
}
export function requireWindow(from?: string, to?: string, required = false) {
  if (!from && !to && !required) return;
  if (!from || !to)
    throw new MerchantWorkflowError('A complete time window is required');
  try {
    if (
      Temporal.Instant.compare(
        Temporal.Instant.from(from),
        Temporal.Instant.from(to),
      ) >= 0
    )
      throw new MerchantWorkflowError(
        'The time window must end after it starts',
      );
  } catch (error) {
    if (error instanceof MerchantWorkflowError) throw error;
    throw new MerchantWorkflowError('Invalid time window');
  }
}
