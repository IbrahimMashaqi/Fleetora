-- READ ONLY. Requires an approved inspection method and out-of-band Neon
-- project/branch/endpoint confirmation. Database name alone is insufficient.
-- Stop on any error. Save results privately; do not put database output in Git.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
SELECT current_database() AS database, current_user AS role,
       current_setting('server_version') AS server_version,
       current_setting('transaction_read_only') AS transaction_read_only,
       transaction_timestamp() AS inspected_at;
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
FROM pg_roles WHERE rolname = current_user;
SELECT space, core_hash, profile_hash FROM prisma_contract.marker ORDER BY space;
SELECT to_regclass('prisma_contract.ledger') AS ledger,
       to_regclass('prisma_contract.contract') AS contract_store;

-- Metadata only: application relations and migration control tables.
SELECT n.nspname AS schema_name, c.relname AS relation_name, c.relkind,
       c.relrowsecurity, c.relforcerowsecurity,
       has_table_privilege(c.oid, 'SELECT') AS can_select,
       has_table_privilege(c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') AS can_write
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'prisma_contract') AND c.relkind IN ('r','p','v','m')
ORDER BY 1, 2;
SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type, a.attnotnull,
       pg_get_expr(d.adbin, d.adrelid) AS column_default,
       a.attidentity, a.attgenerated
FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname IN ('public', 'prisma_contract') AND c.relkind IN ('r','p')
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY 1, 2, a.attnum;
SELECT n.nspname AS schema_name, c.relname AS table_name, con.conname,
       con.contype, con.convalidated, con.condeferrable, con.condeferred,
       pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'prisma_contract') ORDER BY 1, 2, 3;
SELECT n.nspname AS schema_name, t.relname AS table_name, i.relname AS index_name,
       ix.indisunique, ix.indisvalid, ix.indisready,
       pg_get_indexdef(ix.indexrelid) AS definition
FROM pg_index ix JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname IN ('public', 'prisma_contract') ORDER BY 1, 2, 3;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
SELECT n.nspname AS schema_name, c.relname AS table_name, t.tgname, t.tgenabled,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal ORDER BY 1, 2, 3;
SELECT n.nspname AS schema_name, t.typname, e.enumlabel, e.enumsortorder
FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' ORDER BY 1, 2, 4;

-- Aggregates only. No names, contacts, credentials or raw IDs.
SELECT count(*) AS vehicles, md5(string_agg(id, ',' ORDER BY id)) AS vehicle_ids_digest
FROM public.vehicles;
SELECT count(*) AS workers, md5(string_agg(id, ',' ORDER BY id)) AS worker_ids_digest,
       md5(string_agg(json_build_array(id, "companyId", "vehicleId")::text,
                      ',' ORDER BY id)) AS assignments_digest FROM public.workers;
SELECT count(*) AS duplicate_exact_plate_groups FROM (
 SELECT "companyId", "plateNumber" FROM public.vehicles GROUP BY 1,2 HAVING count(*) > 1
) duplicates;
SELECT count(*) AS duplicate_normalized_plate_groups FROM (
 SELECT "companyId", upper(btrim("plateNumber")) FROM public.vehicles GROUP BY 1,2 HAVING count(*) > 1
) duplicates;
SELECT count(*) FILTER (WHERE btrim("plateNumber") = '') AS blank_plates,
       count(*) FILTER (WHERE length(btrim("plateNumber")) > 32) AS plates_over_write_limit
FROM public.vehicles;
SELECT count(*) AS cross_company_assignments FROM public.workers w
JOIN public.vehicles v ON v.id = w."vehicleId" WHERE w."companyId" <> v."companyId";
SELECT count(*) AS orphan_assignments FROM public.workers w
LEFT JOIN public.vehicles v ON v.id = w."vehicleId"
WHERE w."vehicleId" IS NOT NULL AND v.id IS NULL;
SELECT count(*) AS orphan_vehicle_companies FROM public.vehicles v
LEFT JOIN public.companies c ON c.id = v."companyId" WHERE c.id IS NULL;
SELECT count(*) AS orphan_worker_companies FROM public.workers w
LEFT JOIN public.companies c ON c.id = w."companyId" WHERE c.id IS NULL;
SELECT count(*) AS duplicate_assignments FROM (
 SELECT "vehicleId" FROM public.workers WHERE "vehicleId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1
) duplicates;
ROLLBACK;
