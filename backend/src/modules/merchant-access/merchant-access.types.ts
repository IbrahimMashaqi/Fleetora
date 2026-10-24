import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { TokenPayload } from '../auth/token/token.payload.js';

export const MERCHANT_PERMISSIONS = [
  'PARCEL_VIEW',
  'PARCEL_CREATE',
  'PARCEL_EDIT',
  'PARCEL_CANCEL',
  'PARCEL_IMPORT',
  'PICKUP_MANAGE',
  'HISTORY_VIEW',
  'FINANCE_VIEW',
  'SETTLEMENT_REQUEST',
] as const;
export type MerchantPermission = (typeof MERCHANT_PERMISSIONS)[number];
export type MerchantIdentity = Readonly<Pick<TokenPayload, 'sub'>>;
export type MerchantContext = Readonly<{
  userId: string;
  merchantId: string;
  companyId: string;
  membershipId: string;
  owner: boolean;
  permissions: MerchantPermission[];
}>;
export function permissions(value: unknown): MerchantPermission[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (p): p is MerchantPermission =>
        typeof p === 'string' &&
        MERCHANT_PERMISSIONS.some((allowed) => allowed === p),
    )
  ) {
    throw new BadRequestException('Invalid merchant permissions');
  }
  return [...new Set(value)];
}
export function requirePermission(
  context: MerchantContext,
  permission?: MerchantPermission,
) {
  if (
    permission &&
    !context.owner &&
    !context.permissions.includes(permission)
  ) {
    throw new ForbiddenException('Merchant permission required');
  }
  return context;
}
