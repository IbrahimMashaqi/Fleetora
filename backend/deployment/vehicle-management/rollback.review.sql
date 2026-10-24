-- REVIEW ONLY. Prefer rolling back application code and retaining additive columns.
-- Stop fleet mutations, restore previous application, export new field values,
-- and obtain separate approval before a destructive schema rollback.
-- Execute through an approved reverse migration with matching contract/ledger.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
LOCK TABLE public.vehicles IN SHARE ROW EXCLUSIVE MODE;
DO $protect$
BEGIN
 IF EXISTS (SELECT 1 FROM public.vehicles WHERE manufacturer IS NOT NULL OR model IS NOT NULL) THEN
  RAISE EXCEPTION 'Rollback blocked: brand/model data must be exported and explicitly approved for removal';
 END IF;
END
$protect$;
ALTER TABLE public.vehicles DROP CONSTRAINT "vehicles_companyId_plateNumber_key";
ALTER TABLE public.vehicles DROP COLUMN manufacturer, DROP COLUMN model;
COMMIT;
