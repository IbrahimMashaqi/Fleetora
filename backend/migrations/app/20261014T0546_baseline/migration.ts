#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/316de1e8d9642428af4648bcae6927da9aa3df855b50b4a3456412f7e40dd902/contract';
import endContract from '../../snapshots/316de1e8d9642428af4648bcae6927da9aa3df855b50b4a3456412f7e40dd902/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations(): Migration<never, End>['operations'] {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'ai_executions',
        columns: [
          col('agent', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('approvedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('recommendation', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('request', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('shipmentId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('RUNNING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('toolCalls', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'ai_executions_agent_check_8e7cc056',
            "\"agent\" IN ('OPERATIONS_AGENT', 'SUPPORT_AGENT')",
          ),
          checkExpression(
            'ai_executions_status_check_f7af5ecd',
            "\"status\" IN ('RUNNING', 'WAITING_FOR_APPROVAL', 'APPROVED', 'REJECTED', 'COMPLETED', 'FAILED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'companies',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('plan', 'text', {
            notNull: true,
            default: lit('TRIAL'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('suspended', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'companies_plan_check_16898502',
            "\"plan\" IN ('TRIAL', 'BASIC', 'PRO', 'ENTERPRISE')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'location_events',
        columns: [
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('latitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('longitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('recordedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('workerId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'notifications',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('message', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('read', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('workerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'notifications_type_check_08a83016',
            "\"type\" IN ('SHIPMENT_ASSIGNED', 'DELIVERY_UPDATED', 'NEW_TASK', 'DELIVERY_FAILED', 'AI_RECOMMENDATION', 'APPROVAL_REQUIRED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'proof_of_delivery',
        columns: [
          col('capturedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('gpsLatitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('gpsLongitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('photoUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('shipmentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('signatureUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'shipment_history',
        columns: [
          col('event', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('occurredAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('shipmentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'shipments',
        columns: [
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('destination', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('notes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('priority', 'text', {
            notNull: true,
            default: lit('NORMAL'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('requestedBy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('CREATED'),
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
            'shipments_priority_check_72dbae57',
            "\"priority\" IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')",
          ),
          checkExpression(
            'shipments_status_check_efddab2e',
            "\"status\" IN ('CREATED', 'READY_FOR_DISPATCH', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED_DELIVERY', 'RESCHEDULED', 'RETURNED', 'ON_HOLD')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'users',
        columns: [
          col('companyId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('email', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('fullName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('isEmailVerified', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('password', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('refreshToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('verificationToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('verificationTokenExpiresAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'users_role_check_8e96eaf0',
            "\"role\" IN ('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'MERCHANT', 'ACCOUNTANT')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'vehicles',
        columns: [
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('plateNumber', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'vehicles_type_check_8ef84690',
            "\"type\" IN ('MOTORCYCLE', 'CAR', 'VAN', 'TRUCK')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'warehouses',
        columns: [
          col('address', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'workers',
        columns: [
          col('companyId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('fullName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('phone', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('OFFLINE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('successRate', 'float8', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/float8@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('vehicleId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'workers_status_check_ef9962ab',
            "\"status\" IN ('ACTIVE', 'OFFLINE', 'ON_BREAK', 'SUSPENDED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'zones',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('warehouseId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'proof_of_delivery',
        constraint: 'proof_of_delivery_shipmentId_key',
        columns: ['shipmentId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'users',
        constraint: 'users_email_key',
        columns: ['email'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'workers',
        constraint: 'workers_vehicleId_key',
        columns: ['vehicleId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ai_executions',
        index: 'ai_executions_approvedBy_idx_7a053eb3',
        columns: ['approvedBy'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ai_executions',
        index: 'ai_executions_shipmentId_idx_e3606ec1',
        columns: ['shipmentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'location_events',
        index: 'location_events_workerId_idx_0b8f3a7c',
        columns: ['workerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'location_events',
        index: 'location_events_workerId_recordedAt_idx_fb6f79bd',
        columns: ['workerId', 'recordedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'notifications',
        index: 'notifications_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'notifications',
        index: 'notifications_workerId_idx_0b8f3a7c',
        columns: ['workerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'shipment_history',
        index: 'shipment_history_shipmentId_idx_e3606ec1',
        columns: ['shipmentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'shipments',
        index: 'shipments_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'shipments',
        index: 'shipments_requestedBy_idx_e2539833',
        columns: ['requestedBy'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'shipments',
        index: 'shipments_warehouseId_idx_8ff93e70',
        columns: ['warehouseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'shipments',
        index: 'shipments_workerId_idx_0b8f3a7c',
        columns: ['workerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'users',
        index: 'users_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'vehicles',
        index: 'vehicles_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'warehouses',
        index: 'warehouses_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'workers',
        index: 'workers_companyId_idx_33acc5ed',
        columns: ['companyId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'zones',
        index: 'zones_warehouseId_idx_8ff93e70',
        columns: ['warehouseId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ai_executions',
        foreignKey: {
          name: 'ai_executions_shipmentId_fkey',
          columns: ['shipmentId'],
          references: { schema: 'public', table: 'shipments', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ai_executions',
        foreignKey: {
          name: 'ai_executions_approvedBy_fkey',
          columns: ['approvedBy'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'location_events',
        foreignKey: {
          name: 'location_events_workerId_fkey',
          columns: ['workerId'],
          references: { schema: 'public', table: 'workers', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'notifications',
        foreignKey: {
          name: 'notifications_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'notifications',
        foreignKey: {
          name: 'notifications_workerId_fkey',
          columns: ['workerId'],
          references: { schema: 'public', table: 'workers', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'proof_of_delivery',
        foreignKey: {
          name: 'proof_of_delivery_shipmentId_fkey',
          columns: ['shipmentId'],
          references: { schema: 'public', table: 'shipments', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'shipment_history',
        foreignKey: {
          name: 'shipment_history_shipmentId_fkey',
          columns: ['shipmentId'],
          references: { schema: 'public', table: 'shipments', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'shipments',
        foreignKey: {
          name: 'shipments_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'shipments',
        foreignKey: {
          name: 'shipments_warehouseId_fkey',
          columns: ['warehouseId'],
          references: { schema: 'public', table: 'warehouses', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'shipments',
        foreignKey: {
          name: 'shipments_requestedBy_fkey',
          columns: ['requestedBy'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'shipments',
        foreignKey: {
          name: 'shipments_workerId_fkey',
          columns: ['workerId'],
          references: { schema: 'public', table: 'workers', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'users',
        foreignKey: {
          name: 'users_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'vehicles',
        foreignKey: {
          name: 'vehicles_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'warehouses',
        foreignKey: {
          name: 'warehouses_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'workers',
        foreignKey: {
          name: 'workers_companyId_fkey',
          columns: ['companyId'],
          references: { schema: 'public', table: 'companies', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'workers',
        foreignKey: {
          name: 'workers_vehicleId_fkey',
          columns: ['vehicleId'],
          references: { schema: 'public', table: 'vehicles', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'zones',
        foreignKey: {
          name: 'zones_warehouseId_fkey',
          columns: ['warehouseId'],
          references: { schema: 'public', table: 'warehouses', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
