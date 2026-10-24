#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/401bb06d9cd4151564e0008f50c6b60bba52540e6bc564043caa4512f7c185cc/contract';
import startContract from '../../snapshots/401bb06d9cd4151564e0008f50c6b60bba52540e6bc564043caa4512f7c185cc/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9f414f76d4fb32c1e38dc21b1246d1b70af9d69df308c3264ebc0e38b7162d11/contract';
import endContract from '../../snapshots/9f414f76d4fb32c1e38dc21b1246d1b70af9d69df308c3264ebc0e38b7162d11/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'delivery_zones',
        columns: [
          col('active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('baseFeeMinor', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('city', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('currency', 'text', {
            notNull: true,
            default: lit('ILS'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('revision', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'delivery_zone_terms_304e5d3f',
            "\"baseFeeMinor\" >= 0 AND \"revision\" > 0 AND \"currency\" IN ('ILS','USD','EUR','JOD')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'merchant_access_events',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('details', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('merchantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'merchant_imports',
        columns: [
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('confirmedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('createdBy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('digest', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('merchantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('result', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('rows', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'merchant_invitations',
        columns: [
          col('acceptedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('acceptedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('issuedById', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('merchantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('permissions', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('revokedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'merchant_invitation_state_866e5749',
            '"role" IN (\'OWNER\',\'EMPLOYEE\') AND NOT ("acceptedAt" IS NOT NULL AND "revokedAt" IS NOT NULL) AND (("acceptedAt" IS NULL AND "acceptedById" IS NULL) OR ("acceptedAt" IS NOT NULL AND "acceptedById" IS NOT NULL))',
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'merchant_memberships',
        columns: [
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('merchantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('permissions', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'merchant_membership_state_8d4514eb',
            "\"role\" IN ('OWNER','EMPLOYEE') AND \"status\" IN ('ACTIVE','REVOKED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'merchant_parcel_requests',
        columns: [
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('merchantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('parcelRevision', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('previous', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('proposed', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('requestedBy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reviewReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reviewedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('reviewedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('shipmentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('REQUESTED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'merchant_parcel_request_state_9f2bdd06',
            '"kind" IN (\'AMEND\',\'CANCEL\') AND (("status" = \'REQUESTED\' AND "reviewedBy" IS NULL AND "reviewedAt" IS NULL) OR ("status" IN (\'APPROVED\',\'REJECTED\') AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL))',
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'merchant_plans',
        columns: [
          col('active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('currency', 'text', {
            notNull: true,
            default: lit('ILS'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('revision', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'merchant_plan_terms_eae8fe0e',
            "\"revision\" > 0 AND \"currency\" IN ('ILS','USD','EUR','JOD')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'merchant_settlement_requests',
        columns: [
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('currency', 'text', {
            notNull: true,
            default: lit('ILS'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('merchantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('notes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('requestedBy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('REQUESTED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'merchant_settlement_request_state_8bcfc360',
            "\"status\" IN ('REQUESTED','REVIEWED') AND \"currency\" IN ('ILS','USD','EUR','JOD')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'pickup_parcels',
        columns: [
          col('active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('merchantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('pickupId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('receipt', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('receiptNotes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('receivedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('receivedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('shipmentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'pickup_parcel_receipt_6cdef2b2',
            "\"receipt\" IN ('PENDING','RECEIVED','MISSING','DISCREPANT') AND (\"receipt\" = 'PENDING' OR (\"receivedBy\" IS NOT NULL AND \"receivedAt\" IS NOT NULL))",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'pickup_requests',
        columns: [
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('confirmedFrom', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('confirmedTo', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('createdBy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('latitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('longitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('merchantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('method', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('notes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('pickupAddress', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('preferredFrom', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('preferredTo', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('proposedFrom', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('proposedTo', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('reviewedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('revision', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('REQUESTED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('warehouseId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('workerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'pickup_confirmed_window_50678bdd',
            '("confirmedFrom" IS NULL AND "confirmedTo" IS NULL) OR ("confirmedFrom" IS NOT NULL AND "confirmedTo" IS NOT NULL AND "confirmedTo" > "confirmedFrom")',
          ),
          checkExpression(
            'pickup_coordinates_6e73a6d3',
            '("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)',
          ),
          checkExpression(
            'pickup_preferred_window_68f78b5a',
            '("preferredFrom" IS NULL AND "preferredTo" IS NULL) OR ("preferredFrom" IS NOT NULL AND "preferredTo" IS NOT NULL AND "preferredTo" > "preferredFrom")',
          ),
          checkExpression(
            'pickup_request_state_3d349cea',
            "\"method\" IN ('COMPANY_PICKUP','WAREHOUSE_DROPOFF') AND \"status\" IN ('REQUESTED','PROPOSED','CONFIRMED','RECEIVED','CANCELLED') AND \"revision\" > 0",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'plan_zone_tariffs',
        columns: [
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('discountMinor', 'int8', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/int8@1' },
          }),
          col('feeMinor', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('planId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('promotionDiscountMinor', 'int8', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/int8@1' },
          }),
          col('promotionLabel', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('zoneId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'plan_zone_tariff_amounts_e0c86530',
            '"feeMinor" >= 0 AND "discountMinor" >= 0 AND "promotionDiscountMinor" >= 0 AND "feeMinor" >= "discountMinor"+"promotionDiscountMinor" AND ("promotionDiscountMinor" = 0 OR ("promotionLabel" IS NOT NULL AND length(trim("promotionLabel")) > 0))',
          ),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'merchants',
        column: col('planId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'merchants',
        column: col('pricingDiscountMinor', 'int8', {
          notNull: true,
          default: lit('0'),
          codecRef: { codecId: 'pg/int8@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('baseDeliveryFeeMinor', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('collectionMode', 'text', {
          notNull: true,
          default: lit('COD'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('deliveryZoneId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('discountMinor', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('pickupMethod', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('pricingMode', 'text', {
          notNull: true,
          default: lit('LEGACY'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('pricingPlanId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('pricingPlanVersion', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('promotionDiscountMinor', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'delivery_zones',
        constraint: 'delivery_zones_id_companyId_key',
        columns: ['id', 'companyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'merchant_imports',
        constraint: 'merchant_imports_companyId_merchantId_digest_key',
        columns: ['companyId', 'merchantId', 'digest'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'merchant_invitations',
        constraint: 'merchant_invitations_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'merchant_memberships',
        constraint: 'merchant_memberships_userId_key',
        columns: ['userId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'merchant_memberships',
        constraint: 'merchant_memberships_userId_companyId_key',
        columns: ['userId', 'companyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'merchant_plans',
        constraint: 'merchant_plans_id_companyId_key',
        columns: ['id', 'companyId'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'merchants',
        constraint: 'merchant_pricing_discount_1ffead40',
        expression: '"pricingDiscountMinor" >= 0',
      }),
      this.addUnique({
        schema: 'public',
        table: 'pickup_parcels',
        constraint: 'pickup_parcels_pickupId_shipmentId_key',
        columns: ['pickupId', 'shipmentId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'pickup_requests',
        constraint: 'pickup_requests_id_companyId_merchantId_key',
        columns: ['id', 'companyId', 'merchantId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'plan_zone_tariffs',
        constraint: 'plan_zone_tariffs_planId_zoneId_companyId_key',
        columns: ['planId', 'zoneId', 'companyId'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'shipments',
        constraint: 'shipment_collection_mode_de16e4c5',
        expression:
          '"collectionMode" IN (\'COD\',\'PREPAID\') AND ("pricingMode" = \'LEGACY\' OR ("collectionMode" = \'PREPAID\' AND "codMinor" = 0) OR ("collectionMode" = \'COD\' AND "codMinor" > 0))',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'shipments',
        constraint: 'shipment_pricing_snapshot_7447c32c',
        expression:
          '"pricingMode" IN (\'LEGACY\',\'FINAL_INCLUSIVE\') AND ("pricingMode" = \'LEGACY\' OR ("deliveryZoneId" IS NOT NULL AND "pricingPlanId" IS NOT NULL AND "pricingPlanVersion" IS NOT NULL AND "baseDeliveryFeeMinor" IS NOT NULL AND "discountMinor" IS NOT NULL AND "promotionDiscountMinor" IS NOT NULL AND "feePayer" = \'MERCHANT\' AND "serviceFeeMinor" = 0 AND "discountMinor" >= 0 AND "promotionDiscountMinor" >= 0 AND "baseDeliveryFeeMinor" >= "discountMinor"+"promotionDiscountMinor" AND "deliveryFeeMinor" = "baseDeliveryFeeMinor"-"discountMinor"-"promotionDiscountMinor"))',
      }),
      this.addUnique({
        schema: 'public',
        table: 'shipments',
        constraint: 'shipments_id_companyId_merchantId_key',
        columns: ['id', 'companyId', 'merchantId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'users',
        constraint: 'users_id_companyId_key',
        columns: ['id', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'delivery_zones',
        index: 'delivery_zones_companyId_city_name_idx_8c744ff0',
        columns: ['companyId', 'city', 'name'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'delivery_zones',
        index: 'delivery_zones_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_access_events',
        index: 'merchant_access_events_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_access_events',
        index: 'merchant_access_events_merchantId_companyId_idx_dee0f13b',
        columns: ['merchantId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_access_events',
        index: 'p1_merchantaccessevent_1_9089d594',
        columns: ['companyId', 'merchantId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_imports',
        index: 'merchant_imports_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_imports',
        index: 'merchant_imports_merchantId_companyId_idx_dee0f13b',
        columns: ['merchantId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_imports',
        index: 'p1_merchantimport_1_9089d594',
        columns: ['companyId', 'merchantId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_invitations',
        index: 'merchant_invitations_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_invitations',
        index: 'merchant_invitations_merchantId_companyId_idx_dee0f13b',
        columns: ['merchantId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_invitations',
        index: 'p1_merchantinvitation_1_9089d594',
        columns: ['companyId', 'merchantId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_memberships',
        index: 'merchant_memberships_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_memberships',
        index: 'merchant_memberships_companyId_merchantId_status_idx_61054a4a',
        columns: ['companyId', 'merchantId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_memberships',
        index: 'merchant_memberships_merchantId_companyId_idx_dee0f13b',
        columns: ['merchantId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_memberships',
        index: 'merchant_memberships_one_owner_57fef624',
        columns: ['merchantId'],
        extras: { where: '"role" = \'OWNER\' AND "status" = \'ACTIVE\'', unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_parcel_requests',
        index: 'merchant_parcel_requests_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_parcel_requests',
        index: 'merchant_parcel_requests_merchantId_companyId_idx_dee0f13b',
        columns: ['merchantId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_parcel_requests',
        index: 'merchant_parcel_requests_shipmentId_companyId_merchant_f89479b3',
        columns: ['shipmentId', 'companyId', 'merchantId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_parcel_requests',
        index: 'one_pending_parcel_request_a8d8c568',
        columns: ['shipmentId'],
        extras: { where: '"status" = \'REQUESTED\'', unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_parcel_requests',
        index: 'p1_parcel_requests_merchant_36786426',
        columns: ['companyId', 'merchantId', 'shipmentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_parcel_requests',
        index: 'p1_parcel_requests_queue_2c40de03',
        columns: ['companyId', 'status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_plans',
        index: 'merchant_plans_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_plans',
        index: 'merchant_plans_companyId_name_idx_4b7916d1',
        columns: ['companyId', 'name'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_settlement_requests',
        index: 'merchant_settlement_requests_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_settlement_requests',
        index: 'merchant_settlement_requests_merchantId_companyId_idx_dee0f13b',
        columns: ['merchantId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_settlement_requests',
        index: 'p1_merchantsettlementrequest_1_9089d594',
        columns: ['companyId', 'merchantId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_settlement_requests',
        index: 'p1_merchantsettlementrequest_2_ee13c67b',
        columns: ['merchantId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchants',
        index: 'merchants_planId_companyId_idx_dce66228',
        columns: ['planId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'pickup_parcels',
        index: 'one_active_pickup_per_parcel_fa735083',
        columns: ['shipmentId'],
        extras: { where: '"active" = true', unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'pickup_parcels',
        index: 'pickup_parcels_pickupId_companyId_merchantId_idx_374eddd7',
        columns: ['pickupId', 'companyId', 'merchantId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'pickup_parcels',
        index: 'pickup_parcels_shipmentId_companyId_merchantId_idx_f89479b3',
        columns: ['shipmentId', 'companyId', 'merchantId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'pickup_requests',
        index: 'p1_pickuprequest_1_2c40de03',
        columns: ['companyId', 'status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'pickup_requests',
        index: 'p1_pickuprequest_2_9089d594',
        columns: ['companyId', 'merchantId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'pickup_requests',
        index: 'pickup_requests_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'pickup_requests',
        index: 'pickup_requests_merchantId_companyId_idx_dee0f13b',
        columns: ['merchantId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'pickup_requests',
        index: 'pickup_requests_warehouseId_companyId_idx_51e6a2af',
        columns: ['warehouseId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'pickup_requests',
        index: 'pickup_requests_workerId_companyId_idx_95d2064a',
        columns: ['workerId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'plan_zone_tariffs',
        index: 'plan_zone_tariffs_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'plan_zone_tariffs',
        index: 'plan_zone_tariffs_companyId_zoneId_idx_40e49cac',
        columns: ['companyId', 'zoneId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'plan_zone_tariffs',
        index: 'plan_zone_tariffs_planId_companyId_idx_dce66228',
        columns: ['planId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'plan_zone_tariffs',
        index: 'plan_zone_tariffs_zoneId_companyId_idx_6b7b0a4d',
        columns: ['zoneId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'shipments',
        index: 'shipments_deliveryZoneId_companyId_idx_5545125a',
        columns: ['deliveryZoneId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'shipments',
        index: 'shipments_pricingPlanId_companyId_idx_de4a3792',
        columns: ['pricingPlanId', 'companyId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'delivery_zones',
        foreignKey: {
          name: 'delivery_zones_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_access_events',
        foreignKey: {
          name: 'merchant_access_events_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_access_events',
        foreignKey: {
          name: 'merchant_access_events_merchantId_companyId_fkey',
          columns: ['merchantId', 'companyId'],
          references: { schema: 'public', table: 'merchants', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_imports',
        foreignKey: {
          name: 'merchant_imports_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_imports',
        foreignKey: {
          name: 'merchant_imports_merchantId_companyId_fkey',
          columns: ['merchantId', 'companyId'],
          references: { schema: 'public', table: 'merchants', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_invitations',
        foreignKey: {
          name: 'merchant_invitations_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_invitations',
        foreignKey: {
          name: 'merchant_invitations_merchantId_companyId_fkey',
          columns: ['merchantId', 'companyId'],
          references: { schema: 'public', table: 'merchants', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_memberships',
        foreignKey: {
          name: 'merchant_memberships_userId_companyId_fkey',
          columns: ['userId', 'companyId'],
          references: { schema: 'public', table: 'users', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_memberships',
        foreignKey: {
          name: 'merchant_memberships_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_memberships',
        foreignKey: {
          name: 'merchant_memberships_merchantId_companyId_fkey',
          columns: ['merchantId', 'companyId'],
          references: { schema: 'public', table: 'merchants', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_parcel_requests',
        foreignKey: {
          name: 'merchant_parcel_requests_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_parcel_requests',
        foreignKey: {
          name: 'merchant_parcel_requests_merchantId_companyId_fkey',
          columns: ['merchantId', 'companyId'],
          references: { schema: 'public', table: 'merchants', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_parcel_requests',
        foreignKey: {
          name: 'merchant_parcel_requests_shipmentId_companyId_merchantId_fkey',
          columns: ['shipmentId', 'companyId', 'merchantId'],
          references: {
            schema: 'public',
            table: 'shipments',
            columns: ['id', 'companyId', 'merchantId'],
          },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_plans',
        foreignKey: {
          name: 'merchant_plans_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_settlement_requests',
        foreignKey: {
          name: 'merchant_settlement_requests_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_settlement_requests',
        foreignKey: {
          name: 'merchant_settlement_requests_merchantId_companyId_fkey',
          columns: ['merchantId', 'companyId'],
          references: { schema: 'public', table: 'merchants', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchants',
        foreignKey: {
          name: 'merchants_planId_companyId_fkey',
          columns: ['planId', 'companyId'],
          references: { schema: 'public', table: 'merchant_plans', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'pickup_parcels',
        foreignKey: {
          name: 'pickup_parcels_pickupId_companyId_merchantId_fkey',
          columns: ['pickupId', 'companyId', 'merchantId'],
          references: {
            schema: 'public',
            table: 'pickup_requests',
            columns: ['id', 'companyId', 'merchantId'],
          },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'pickup_parcels',
        foreignKey: {
          name: 'pickup_parcels_shipmentId_companyId_merchantId_fkey',
          columns: ['shipmentId', 'companyId', 'merchantId'],
          references: {
            schema: 'public',
            table: 'shipments',
            columns: ['id', 'companyId', 'merchantId'],
          },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'pickup_requests',
        foreignKey: {
          name: 'pickup_requests_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'pickup_requests',
        foreignKey: {
          name: 'pickup_requests_merchantId_companyId_fkey',
          columns: ['merchantId', 'companyId'],
          references: { schema: 'public', table: 'merchants', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'pickup_requests',
        foreignKey: {
          name: 'pickup_requests_workerId_companyId_fkey',
          columns: ['workerId', 'companyId'],
          references: { schema: 'public', table: 'workers', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'pickup_requests',
        foreignKey: {
          name: 'pickup_requests_warehouseId_companyId_fkey',
          columns: ['warehouseId', 'companyId'],
          references: { schema: 'public', table: 'warehouses', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'plan_zone_tariffs',
        foreignKey: {
          name: 'plan_zone_tariffs_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'plan_zone_tariffs',
        foreignKey: {
          name: 'plan_zone_tariffs_planId_companyId_fkey',
          columns: ['planId', 'companyId'],
          references: { schema: 'public', table: 'merchant_plans', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'plan_zone_tariffs',
        foreignKey: {
          name: 'plan_zone_tariffs_zoneId_companyId_fkey',
          columns: ['zoneId', 'companyId'],
          references: { schema: 'public', table: 'delivery_zones', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'shipments',
        foreignKey: {
          name: 'shipments_deliveryZoneId_companyId_fkey',
          columns: ['deliveryZoneId', 'companyId'],
          references: { schema: 'public', table: 'delivery_zones', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'shipments',
        foreignKey: {
          name: 'shipments_pricingPlanId_companyId_fkey',
          columns: ['pricingPlanId', 'companyId'],
          references: { schema: 'public', table: 'merchant_plans', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
