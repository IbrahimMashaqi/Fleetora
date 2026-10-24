-- READ ONLY. Run before resuming writes, using the approved inspection method.
-- Also rerun preflight.sql and compare all metadata and saved counts/digests.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT space, core_hash, profile_hash,
       core_hash = '3dfdcd69d14fa5c5906a7720fd95d7cf6474d1535434f04efb18f0250c404303'
       AND profile_hash = '3916f444a8a17ad749191acf9e08dad97d1a327b88c2f1d45d12f240296aa8b2'
       AS matches_reviewed_destination
FROM prisma_contract.marker WHERE space = 'app';
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_schema = 'public'
AND table_name = 'vehicles' AND column_name IN ('manufacturer','model') ORDER BY 1;
SELECT count(*) AS vehicles_with_metadata FROM public.vehicles
WHERE manufacturer IS NOT NULL OR model IS NOT NULL;
SELECT count(*) AS memberships FROM public.company_memberships;
SELECT count(*) AS platform_grants FROM public.platform_admin_grants;
SELECT conrelid::regclass AS table_name, conname, convalidated,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid IN ('public.vehicles'::regclass,'public.workers'::regclass)
ORDER BY 1,2;
ROLLBACK;
