// Read-only inspection through the same pinned TLS/channel-binding control driver.
// Outputs aggregates and schema metadata only, never rows or connection settings.
import { MigrationSecurityError } from '../vehicle-management/secure-driver';

const baseline =
  '9a81be706b19e625d323a75966347489edab4d41d74b73b445d7392c5989323c';
const target =
  '401bb06d9cd4151564e0008f50c6b60bba52540e6bc564043caa4512f7c185cc';
const existing = [
  'companies',
  'users',
  'workers',
  'vehicles',
  'warehouses',
  'zones',
  'shipments',
  'shipment_history',
  'proof_of_delivery',
  'location_events',
  'company_headquarters',
  'driver_tracking_states',
  'notifications',
  'ai_executions',
  'company_memberships',
  'platform_admin_grants',
];
const added = [
  'merchants',
  'parcel_attempts',
  'parcel_returns',
  'cod_collections',
  'cash_remittances',
  'merchant_ledger_entries',
  'merchant_settlements',
  'merchant_settlement_lines',
  'settlement_allocations',
  'settlement_payments',
  'monetary_requests',
];
let stage = 'configuration';
async function inspect() {
  const phase = process.argv[2];
  if (
    !['before', 'after'].includes(phase) ||
    process.env.FLEETORA_MIGRATION_READ_ONLY !== '1'
  )
    throw new Error('READ_ONLY_PHASE_REQUIRED');
  const { default: config } = await import('../../prisma.production.config');
  const connection = config.orm.db?.connection;
  if (typeof connection !== 'string') throw new Error('CONFIGURATION_INVALID');
  const driver = await config.orm.driver.create(connection);
  try {
    stage = 'transaction';
    await driver.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    stage = 'marker';
    const marker = (
      await driver.query(
        "SELECT space, core_hash, profile_hash FROM prisma_contract.marker WHERE space = 'app'",
      )
    ).rows;
    if (
      marker.length !== 1 ||
      marker[0].core_hash !== (phase === 'before' ? baseline : target)
    )
      throw new Error('UNEXPECTED_CONTRACT_MARKER');
    const counts: Record<string, unknown> = {};
    for (const table of existing) {
      stage = `counts:${table}`;
      const key =
        table === 'company_headquarters'
          ? '"companyId"'
          : table === 'driver_tracking_states'
            ? '"workerId"'
            : 'id';
      counts[table] = (
        await driver.query(
          `SELECT count(*)::int AS count, md5(string_agg(${key}::text, ',' ORDER BY ${key})) AS id_digest FROM public."${table}"`,
        )
      ).rows[0];
    }
    stage = 'relations';
    const conflicts = (
      await driver.query(`SELECT
      (SELECT count(*)::int FROM public.shipments s LEFT JOIN public.workers w ON w.id=s."workerId" WHERE s."workerId" IS NOT NULL AND (w.id IS NULL OR w."companyId"<>s."companyId")) AS worker_conflicts,
      (SELECT count(*)::int FROM public.shipments s LEFT JOIN public.warehouses w ON w.id=s."warehouseId" WHERE s."warehouseId" IS NOT NULL AND (w.id IS NULL OR w."companyId"<>s."companyId")) AS warehouse_conflicts`)
    ).rows[0];
    if (Object.values(conflicts).some((value) => value !== 0))
      throw new Error('EXISTING_TENANT_RELATION_CONFLICT');
    const tables = (
      await driver.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
      )
    ).rows.map((row) => row.table_name);
    if (phase === 'before' && added.some((table) => tables.includes(table)))
      throw new Error('UNEXPECTED_PARTIAL_PARCEL_SCHEMA');
    if (phase === 'after' && added.some((table) => !tables.includes(table)))
      throw new Error('MISSING_PARCEL_TABLE');
    if (phase === 'after')
      for (const table of added)
        counts[table] = (
          await driver.query(
            `SELECT count(*)::int AS count FROM public."${table}"`,
          )
        ).rows[0];
    stage = 'history';
    const history = (
      await driver.query(
        "SELECT id, space, migration_name, migration_hash, origin_core_hash, destination_core_hash FROM prisma_contract.ledger WHERE space='app' ORDER BY id DESC LIMIT 12",
      )
    ).rows;
    const result = {
      phase,
      inspectedAt: new Date().toISOString(),
      security: driver.security,
      marker,
      counts,
      conflicts,
      history,
      tables,
    };
    await driver.query('ROLLBACK');
    // The caller chooses whether to save this aggregate-only inspection result.
    console.log(JSON.stringify(result));
  } finally {
    await driver.close();
  }
}
inspect().catch((error) => {
  console.error(
    error instanceof MigrationSecurityError
      ? error.message
      : [
            'READ_ONLY_PHASE_REQUIRED',
            'CONFIGURATION_INVALID',
            'UNEXPECTED_CONTRACT_MARKER',
            'EXISTING_TENANT_RELATION_CONFLICT',
            'UNEXPECTED_PARTIAL_PARCEL_SCHEMA',
            'MISSING_PARCEL_TABLE',
          ].includes(error?.message)
        ? error.message
        : `PARCEL_INSPECTION_FAILED:${stage}`,
  );
  process.exitCode = 1;
});
