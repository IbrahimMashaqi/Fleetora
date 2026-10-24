#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/401bb06d9cd4151564e0008f50c6b60bba52540e6bc564043caa4512f7c185cc/contract';
import endContract from '../../snapshots/401bb06d9cd4151564e0008f50c6b60bba52540e6bc564043caa4512f7c185cc/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/9a81be706b19e625d323a75966347489edab4d41d74b73b445d7392c5989323c/contract';
import startContract from '../../snapshots/9a81be706b19e625d323a75966347489edab4d41d74b73b445d7392c5989323c/contract.json' with { type: 'json' };
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
      this.dropCheckConstraint({
        schema: 'public',
        table: 'shipments',
        constraint: 'shipments_status_check_efddab2e',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'shipments',
        constraint: 'shipments_warehouseId_fkey',
        kind: 'foreignKey',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'shipments',
        constraint: 'shipments_workerId_fkey',
        kind: 'foreignKey',
      }),
      this.createTable({
        schema: 'public',
        table: 'cash_remittances',
        columns: [
          col('actorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('amountMinor', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('collectionId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('method', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('notes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reference', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('remittance_amount_b855849f', '"amountMinor" > 0'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'cod_collections',
        columns: [
          col('amountMinor', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('collectedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('currency', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('goodsMinor', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('merchantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('method', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('notes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('recordedBy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reference', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('shipmentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('workerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'collection_amounts_01edfbe4',
            '"amountMinor" > 0 AND "goodsMinor" >= 0 AND "goodsMinor" <= "amountMinor"',
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'merchant_ledger_entries',
        columns: [
          col('actorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('amountMinor', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('collectionId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('currency', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('merchantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('originalId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('postingKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('shipmentId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'merchant_ledger_kind_sign_0ea8dc30',
            '("kind" = \'GOODS\' AND "amountMinor" > 0 AND "collectionId" IS NOT NULL AND "originalId" IS NULL) OR ("kind" IN (\'DELIVERY_FEE\',\'RETURN_FEE\') AND "amountMinor" < 0 AND "shipmentId" IS NOT NULL AND "originalId" IS NULL) OR ("kind" = \'ADJUSTMENT\' AND "amountMinor" <> 0 AND "originalId" IS NULL) OR ("kind" = \'REVERSAL\' AND "amountMinor" <> 0 AND "originalId" IS NOT NULL)',
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'merchant_settlement_lines',
        columns: [
          col('amountMinor', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ledgerEntryId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('settlementId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('shipmentId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'merchant_settlements',
        columns: [
          col('adjustmentsMinor', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('cancellationReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('cancelledAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('cancelledBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('createdBy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('currency', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('deliveryFeesMinor', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('finalizedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('finalizedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('from', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('grossCollectedMinor', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('merchantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('netPayableMinor', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('paidAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('returnFeesMinor', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('revision', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('to', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'merchant_settlement_state_bf74c75b',
            '("status" = \'DRAFT\' AND "finalizedAt" IS NULL AND "paidAt" IS NULL AND "cancelledAt" IS NULL) OR ("status" = \'FINALIZED\' AND "finalizedAt" IS NOT NULL AND "finalizedBy" IS NOT NULL AND "paidAt" IS NULL AND "cancelledAt" IS NULL) OR ("status" = \'PAID\' AND "finalizedAt" IS NOT NULL AND "finalizedBy" IS NOT NULL AND "paidAt" IS NOT NULL AND "cancelledAt" IS NULL) OR ("status" = \'CANCELLED\' AND "cancelledAt" IS NOT NULL AND "cancelledBy" IS NOT NULL AND "cancellationReason" IS NOT NULL AND "finalizedAt" IS NULL AND "paidAt" IS NULL)',
          ),
          checkExpression('settlement_amount_5f6a5e33', '"netPayableMinor" > 0 AND "revision" > 0'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'merchants',
        columns: [
          col('active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('city', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('contactName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('currency', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('deliveryFeeMinor', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('feePayer', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('latitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('longitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('notes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('paymentNotes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('phone', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('pickupAddress', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('returnFeeMinor', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('returnFeePolicy', 'text', {
            notNull: true,
            default: lit('ON_MERCHANT_HANDOFF'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('revision', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('secondaryPhone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('serviceFeeMinor', 'int8', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/int8@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'merchant_coordinates_6e73a6d3',
            '("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)',
          ),
          checkExpression(
            'merchant_terms_amounts_a6ee4230',
            '"deliveryFeeMinor" >= 0 AND "returnFeeMinor" >= 0 AND "serviceFeeMinor" >= 0 AND "revision" > 0',
          ),
          checkExpression(
            'merchant_terms_policy_2dda9ae4',
            "\"currency\" IN ('ILS','USD','EUR','JOD') AND \"feePayer\" IN ('MERCHANT','CUSTOMER') AND \"returnFeePolicy\" IN ('NONE','ON_MERCHANT_HANDOFF')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'monetary_requests',
        columns: [
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('payloadHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('resultId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'parcel_attempts',
        columns: [
          col('actorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('outcome', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('shipmentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'parcel_returns',
        columns: [
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('initiatedBy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('merchantAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('shipmentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('warehouseAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'parcel_return_stage_651b3752',
            "\"status\" IN ('RETURN_IN_PROGRESS','RETURNED_TO_WAREHOUSE','RETURNED_TO_MERCHANT') AND \"reason\" IN ('CUSTOMER_REFUSED','UNREACHABLE','WRONG_ADDRESS','DAMAGED','OTHER','CUSTOMER_CANCELLED','ATTEMPTS_EXHAUSTED','MERCHANT_REQUESTED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'settlement_allocations',
        columns: [
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ledgerEntryId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('settlementId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'settlement_payments',
        columns: [
          col('amountMinor', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('currency', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('method', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('paidAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('recordedBy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reference', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('settlementId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('settlement_payment_amount_b855849f', '"amountMinor" > 0'),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipment_history',
        column: col('actorId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipment_history',
        column: col('custody', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipment_history',
        column: col('fromStatus', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipment_history',
        column: col('locationLabel', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipment_history',
        column: col('newWorkerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipment_history',
        column: col('newWorkerName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipment_history',
        column: col('note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipment_history',
        column: col('oldWorkerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipment_history',
        column: col('oldWorkerName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipment_history',
        column: col('toStatus', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('attemptCount', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('city', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('codMinor', 'int8', {
          notNull: true,
          default: lit('0'),
          codecRef: { codecId: 'pg/int8@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('currency', 'text', {
          notNull: true,
          default: lit('ILS'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('custody', 'text', {
          notNull: true,
          default: lit('MERCHANT'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('customerNotes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('declaredValueMinor', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('deliveredAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('deliveryFeeMinor', 'int8', {
          notNull: true,
          default: lit('0'),
          codecRef: { codecId: 'pg/int8@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('feePayer', 'text', {
          notNull: true,
          default: lit('MERCHANT'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('instructions', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('latitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('locationLabel', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('locationSource', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('locationUpdatedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('longitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('merchantId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('merchantReference', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('pieces', 'int4', {
          notNull: true,
          default: lit(1),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('recipientName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('recipientPhone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('responsibleActorId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('returnFeeMinor', 'int8', {
          notNull: true,
          default: lit('0'),
          codecRef: { codecId: 'pg/int8@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('returnFeePolicy', 'text', {
          notNull: true,
          default: lit('ON_MERCHANT_HANDOFF'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('returnedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('revision', 'int4', {
          notNull: true,
          default: lit(1),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('scheduledAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('secondaryPhone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('serviceFeeMinor', 'int8', {
          notNull: true,
          default: lit('0'),
          codecRef: { codecId: 'pg/int8@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('trackingNumber', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'shipments',
        column: col('weight', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'cash_remittances',
        constraint: 'cash_remittances_collectionId_key',
        columns: ['collectionId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'cash_remittances',
        constraint: 'cash_remittances_collectionId_companyId_key',
        columns: ['collectionId', 'companyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'cod_collections',
        constraint: 'cod_collections_shipmentId_key',
        columns: ['shipmentId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'cod_collections',
        constraint: 'cod_collections_id_companyId_key',
        columns: ['id', 'companyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'cod_collections',
        constraint: 'cod_collections_shipmentId_companyId_key',
        columns: ['shipmentId', 'companyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'merchant_ledger_entries',
        constraint: 'merchant_ledger_entries_originalId_key',
        columns: ['originalId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'merchant_ledger_entries',
        constraint: 'merchant_ledger_entries_id_companyId_key',
        columns: ['id', 'companyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'merchant_ledger_entries',
        constraint: 'merchant_ledger_entries_companyId_postingKey_key',
        columns: ['companyId', 'postingKey'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'merchant_ledger_entries',
        constraint: 'merchant_ledger_entries_originalId_companyId_key',
        columns: ['originalId', 'companyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'merchant_settlement_lines',
        constraint: 'merchant_settlement_lines_settlementId_ledgerEntryId_key',
        columns: ['settlementId', 'ledgerEntryId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'merchant_settlements',
        constraint: 'merchant_settlements_id_companyId_key',
        columns: ['id', 'companyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'merchants',
        constraint: 'merchants_id_companyId_key',
        columns: ['id', 'companyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'monetary_requests',
        constraint: 'monetary_requests_companyId_key_key',
        columns: ['companyId', 'key'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'parcel_returns',
        constraint: 'parcel_returns_shipmentId_key',
        columns: ['shipmentId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'parcel_returns',
        constraint: 'parcel_returns_shipmentId_companyId_key',
        columns: ['shipmentId', 'companyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'settlement_allocations',
        constraint: 'settlement_allocations_ledgerEntryId_key',
        columns: ['ledgerEntryId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'settlement_allocations',
        constraint: 'settlement_allocations_ledgerEntryId_companyId_key',
        columns: ['ledgerEntryId', 'companyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'settlement_payments',
        constraint: 'settlement_payments_settlementId_key',
        columns: ['settlementId'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'shipments',
        constraint: 'shipment_coordinates_6e73a6d3',
        expression:
          '("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'shipments',
        constraint: 'shipment_fee_policy_2dda9ae4',
        expression:
          "\"currency\" IN ('ILS','USD','EUR','JOD') AND \"feePayer\" IN ('MERCHANT','CUSTOMER') AND \"returnFeePolicy\" IN ('NONE','ON_MERCHANT_HANDOFF')",
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'shipments',
        constraint: 'shipments_parcel_amounts_1d8cca74',
        expression:
          '"pieces" > 0 AND "revision" > 0 AND "attemptCount" >= 0 AND ("declaredValueMinor" IS NULL OR "declaredValueMinor" >= 0) AND ("weight" IS NULL OR "weight" > 0) AND "codMinor" >= 0 AND "deliveryFeeMinor" >= 0 AND "returnFeeMinor" >= 0 AND "serviceFeeMinor" >= 0',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'shipments',
        constraint: 'shipments_status_check_42e0f930',
        expression:
          "\"status\" IN ('CREATED', 'READY_FOR_DISPATCH', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED_DELIVERY', 'RESCHEDULED', 'RETURNED', 'ON_HOLD', 'RECEIVED_FROM_MERCHANT', 'AT_WAREHOUSE', 'RETURN_IN_PROGRESS', 'RETURNED_TO_WAREHOUSE', 'RETURNED_TO_MERCHANT')",
      }),
      this.addUnique({
        schema: 'public',
        table: 'shipments',
        constraint: 'shipments_id_companyId_key',
        columns: ['id', 'companyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'shipments',
        constraint: 'shipments_trackingNumber_key',
        columns: ['trackingNumber'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'warehouses',
        constraint: 'warehouses_id_companyId_key',
        columns: ['id', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cash_remittances',
        index: 'parcel_ops_index_10_5377e5d5',
        columns: ['companyId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cod_collections',
        index: 'cod_collections_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cod_collections',
        index: 'cod_collections_merchantId_companyId_idx_dee0f13b',
        columns: ['merchantId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cod_collections',
        index: 'cod_collections_workerId_companyId_idx_95d2064a',
        columns: ['workerId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cod_collections',
        index: 'parcel_ops_index_7_4693e387',
        columns: ['companyId', 'merchantId', 'collectedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cod_collections',
        index: 'parcel_ops_index_8_82008f07',
        columns: ['companyId', 'workerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_ledger_entries',
        index: 'merchant_ledger_entries_collectionId_companyId_idx_00746e5a',
        columns: ['collectionId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_ledger_entries',
        index: 'merchant_ledger_entries_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_ledger_entries',
        index: 'merchant_ledger_entries_merchantId_companyId_idx_dee0f13b',
        columns: ['merchantId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_ledger_entries',
        index: 'merchant_ledger_entries_shipmentId_companyId_idx_ecb554d0',
        columns: ['shipmentId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_ledger_entries',
        index: 'parcel_ops_index_14_baa670cc',
        columns: ['companyId', 'merchantId', 'currency', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_settlement_lines',
        index: 'merchant_settlement_lines_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_settlement_lines',
        index: 'merchant_settlement_lines_ledgerEntryId_companyId_idx_d7a3f41c',
        columns: ['ledgerEntryId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_settlement_lines',
        index: 'merchant_settlement_lines_settlementId_companyId_idx_1d53ae2b',
        columns: ['settlementId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_settlement_lines',
        index: 'parcel_ops_index_19_c8b7f15e',
        columns: ['companyId', 'settlementId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_settlements',
        index: 'merchant_settlements_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_settlements',
        index: 'merchant_settlements_merchantId_companyId_idx_dee0f13b',
        columns: ['merchantId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchant_settlements',
        index: 'parcel_ops_index_17_c520fc9f',
        columns: ['companyId', 'merchantId', 'status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchants',
        index: 'merchants_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'merchants',
        index: 'parcel_ops_index_2_4b7916d1',
        columns: ['companyId', 'name'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'monetary_requests',
        index: 'monetary_requests_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'parcel_attempts',
        index: 'parcel_attempts_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'parcel_attempts',
        index: 'parcel_attempts_shipmentId_companyId_idx_ecb554d0',
        columns: ['shipmentId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'parcel_attempts',
        index: 'parcel_ops_index_3_df760367',
        columns: ['companyId', 'shipmentId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'parcel_returns',
        index: 'parcel_ops_index_4_2c40de03',
        columns: ['companyId', 'status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'parcel_returns',
        index: 'parcel_returns_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'settlement_allocations',
        index: 'parcel_ops_index_20_c8b7f15e',
        columns: ['companyId', 'settlementId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'settlement_allocations',
        index: 'settlement_allocations_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'settlement_allocations',
        index: 'settlement_allocations_settlementId_companyId_idx_1d53ae2b',
        columns: ['settlementId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'settlement_payments',
        index: 'parcel_ops_index_22_5377e5d5',
        columns: ['companyId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'settlement_payments',
        index: 'settlement_payments_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'settlement_payments',
        index: 'settlement_payments_settlementId_companyId_idx_1d53ae2b',
        columns: ['settlementId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'shipments',
        index: 'shipments_companyId_createdAt_idx_5377e5d5',
        columns: ['companyId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'shipments',
        index: 'shipments_companyId_merchantId_idx_9ef0d597',
        columns: ['companyId', 'merchantId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'shipments',
        index: 'shipments_companyId_status_idx_86f6fb02',
        columns: ['companyId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'shipments',
        index: 'shipments_merchantId_companyId_idx_dee0f13b',
        columns: ['merchantId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'shipments',
        index: 'shipments_warehouseId_companyId_idx_51e6a2af',
        columns: ['warehouseId', 'companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'shipments',
        index: 'shipments_workerId_companyId_idx_95d2064a',
        columns: ['workerId', 'companyId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cash_remittances',
        foreignKey: {
          name: 'cash_remittances_collectionId_companyId_fkey',
          columns: ['collectionId', 'companyId'],
          references: { schema: 'public', table: 'cod_collections', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cod_collections',
        foreignKey: {
          name: 'cod_collections_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cod_collections',
        foreignKey: {
          name: 'cod_collections_shipmentId_companyId_fkey',
          columns: ['shipmentId', 'companyId'],
          references: { schema: 'public', table: 'shipments', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cod_collections',
        foreignKey: {
          name: 'cod_collections_merchantId_companyId_fkey',
          columns: ['merchantId', 'companyId'],
          references: { schema: 'public', table: 'merchants', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cod_collections',
        foreignKey: {
          name: 'cod_collections_workerId_companyId_fkey',
          columns: ['workerId', 'companyId'],
          references: { schema: 'public', table: 'workers', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_ledger_entries',
        foreignKey: {
          name: 'merchant_ledger_entries_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_ledger_entries',
        foreignKey: {
          name: 'merchant_ledger_entries_merchantId_companyId_fkey',
          columns: ['merchantId', 'companyId'],
          references: { schema: 'public', table: 'merchants', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_ledger_entries',
        foreignKey: {
          name: 'merchant_ledger_entries_shipmentId_companyId_fkey',
          columns: ['shipmentId', 'companyId'],
          references: { schema: 'public', table: 'shipments', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_ledger_entries',
        foreignKey: {
          name: 'merchant_ledger_entries_collectionId_companyId_fkey',
          columns: ['collectionId', 'companyId'],
          references: { schema: 'public', table: 'cod_collections', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_ledger_entries',
        foreignKey: {
          name: 'merchant_ledger_entries_originalId_companyId_fkey',
          columns: ['originalId', 'companyId'],
          references: {
            schema: 'public',
            table: 'merchant_ledger_entries',
            columns: ['id', 'companyId'],
          },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_settlement_lines',
        foreignKey: {
          name: 'merchant_settlement_lines_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_settlement_lines',
        foreignKey: {
          name: 'merchant_settlement_lines_settlementId_companyId_fkey',
          columns: ['settlementId', 'companyId'],
          references: {
            schema: 'public',
            table: 'merchant_settlements',
            columns: ['id', 'companyId'],
          },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_settlement_lines',
        foreignKey: {
          name: 'merchant_settlement_lines_ledgerEntryId_companyId_fkey',
          columns: ['ledgerEntryId', 'companyId'],
          references: {
            schema: 'public',
            table: 'merchant_ledger_entries',
            columns: ['id', 'companyId'],
          },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_settlements',
        foreignKey: {
          name: 'merchant_settlements_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchant_settlements',
        foreignKey: {
          name: 'merchant_settlements_merchantId_companyId_fkey',
          columns: ['merchantId', 'companyId'],
          references: { schema: 'public', table: 'merchants', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'merchants',
        foreignKey: {
          name: 'merchants_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'monetary_requests',
        foreignKey: {
          name: 'monetary_requests_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'parcel_attempts',
        foreignKey: {
          name: 'parcel_attempts_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'parcel_attempts',
        foreignKey: {
          name: 'parcel_attempts_shipmentId_companyId_fkey',
          columns: ['shipmentId', 'companyId'],
          references: { schema: 'public', table: 'shipments', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'parcel_returns',
        foreignKey: {
          name: 'parcel_returns_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'parcel_returns',
        foreignKey: {
          name: 'parcel_returns_shipmentId_companyId_fkey',
          columns: ['shipmentId', 'companyId'],
          references: { schema: 'public', table: 'shipments', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'settlement_allocations',
        foreignKey: {
          name: 'settlement_allocations_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'settlement_allocations',
        foreignKey: {
          name: 'settlement_allocations_settlementId_companyId_fkey',
          columns: ['settlementId', 'companyId'],
          references: {
            schema: 'public',
            table: 'merchant_settlements',
            columns: ['id', 'companyId'],
          },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'settlement_allocations',
        foreignKey: {
          name: 'settlement_allocations_ledgerEntryId_companyId_fkey',
          columns: ['ledgerEntryId', 'companyId'],
          references: {
            schema: 'public',
            table: 'merchant_ledger_entries',
            columns: ['id', 'companyId'],
          },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'settlement_payments',
        foreignKey: {
          name: 'settlement_payments_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'settlement_payments',
        foreignKey: {
          name: 'settlement_payments_settlementId_companyId_fkey',
          columns: ['settlementId', 'companyId'],
          references: {
            schema: 'public',
            table: 'merchant_settlements',
            columns: ['id', 'companyId'],
          },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'shipments',
        foreignKey: {
          name: 'shipments_merchantId_companyId_fkey',
          columns: ['merchantId', 'companyId'],
          references: { schema: 'public', table: 'merchants', columns: ['id', 'companyId'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'shipments',
        foreignKey: {
          name: 'shipments_warehouseId_companyId_fkey',
          columns: ['warehouseId', 'companyId'],
          references: { schema: 'public', table: 'warehouses', columns: ['id', 'companyId'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'shipments',
        foreignKey: {
          name: 'shipments_workerId_companyId_fkey',
          columns: ['workerId', 'companyId'],
          references: { schema: 'public', table: 'workers', columns: ['id', 'companyId'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
