-- PROVISIONING REVIEW ONLY. A human administrator executes this in fleetora
-- on the verified Neon branch. The inspection agent must not execute this file.
-- New role only: fail if it already exists. No password is embedded.
BEGIN;
CREATE ROLE fleetora_inspect WITH LOGIN NOINHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

GRANT CONNECT ON DATABASE fleetora TO fleetora_inspect;
GRANT USAGE ON SCHEMA public, prisma_contract TO fleetora_inspect;

GRANT SELECT (id, "companyId", "plateNumber")
  ON public.vehicles TO fleetora_inspect;
GRANT SELECT (id, "companyId", "vehicleId")
  ON public.workers TO fleetora_inspect;
GRANT SELECT (id)
  ON public.companies TO fleetora_inspect;
GRANT SELECT (space, core_hash, profile_hash)
  ON prisma_contract.marker TO fleetora_inspect;

-- A missing ledger must remain missing; preflight will report its absence.
DO $history$
BEGIN
  IF to_regclass('prisma_contract.ledger') IS NOT NULL THEN
    GRANT SELECT (id, created_at, space, migration_name, migration_hash,
                  origin_core_hash, origin_profile_hash,
                  destination_core_hash, destination_profile_hash)
      ON prisma_contract.ledger TO fleetora_inspect;
  END IF;
END
$history$;

-- Defense in depth, not a substitute for restricted privileges.
ALTER ROLE fleetora_inspect IN DATABASE fleetora
  SET default_transaction_read_only = on;
COMMIT;
