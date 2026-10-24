-- REVIEW ONLY: not a runnable Prisma deployment or marker reconciliation.
-- Known Neon baseline marker fails this guard. Do NOT bypass it.
-- Apply only through a separately reviewed Prisma migration after drift is resolved.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $preflight$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM prisma_contract.marker WHERE space='app' AND core_hash='cb732e7410ed221c37e6d0e555810415ba5551ef7b1d2a81c12645466ac8236a') THEN
  RAISE EXCEPTION 'Vehicle migration blocked: parent contract mismatch';
 END IF;
 IF to_regclass('public.company_memberships') IS NULL OR to_regclass('public.platform_admin_grants') IS NULL THEN
  RAISE EXCEPTION 'Vehicle migration blocked: unresolved authorization foundation drift';
 END IF;
END
$preflight$;
LOCK TABLE public.vehicles, public.workers IN SHARE ROW EXCLUSIVE MODE;
DO $data$
BEGIN
 IF EXISTS (SELECT 1 FROM public.vehicles GROUP BY "companyId",upper(btrim("plateNumber")) HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Vehicle migration blocked: duplicate company plates require separate resolution';
 END IF;
 IF EXISTS (SELECT 1 FROM public.workers w JOIN public.vehicles v ON v.id=w."vehicleId" WHERE w."companyId"<>v."companyId") THEN
  RAISE EXCEPTION 'Vehicle migration blocked: cross-company assignments require separate resolution';
 END IF;
 IF EXISTS (SELECT 1 FROM public.workers w LEFT JOIN public.vehicles v ON v.id=w."vehicleId" WHERE w."vehicleId" IS NOT NULL AND v.id IS NULL) THEN
  RAISE EXCEPTION 'Vehicle migration blocked: orphan assignments require separate resolution';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.workers'::regclass
   AND c.contype='u' AND c.convalidated AND NOT c.condeferrable
   AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.workers'::regclass AND attname='vehicleId')]::smallint[]
 ) THEN
  RAISE EXCEPTION 'Vehicle migration blocked: required unique worker vehicle constraint missing';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.workers'::regclass
   AND c.contype='f' AND c.convalidated AND NOT c.condeferrable
   AND c.confrelid='public.vehicles'::regclass
   AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.workers'::regclass AND attname='vehicleId')]::smallint[]
   AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.vehicles'::regclass AND attname='id')]::smallint[]
 ) THEN
  RAISE EXCEPTION 'Vehicle migration blocked: required worker vehicle foreign key missing';
 END IF;
END
$data$;
ALTER TABLE public.vehicles ADD COLUMN manufacturer text NULL, ADD COLUMN model text NULL;
ALTER TABLE public.vehicles ADD CONSTRAINT "vehicles_companyId_plateNumber_key" UNIQUE ("companyId","plateNumber");
-- The reviewed Prisma migration runner must register its new contract and ledger
-- atomically with these operations. This preview intentionally does not spoof it.
COMMIT;
