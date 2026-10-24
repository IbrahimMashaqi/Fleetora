-- REVIEW ONLY. Not executed by preparation or by the migration packages.
-- A human administrator may execute this ONLY after separate approval and
-- successful migration, while application writers remain paused.
-- Verify database fleetora on project patient-mud-78406881,
-- branch br-square-queen-b1jmdng0, endpoint ep-morning-base-b1jhw9q2 first.
-- Fail if the new tables/columns are missing; do not add IF EXISTS fallbacks.
-- Existing CONNECT, schema USAGE, marker, ledger and directory SELECT grants
-- are retained. No default privileges, role memberships or write grants added.
BEGIN;
GRANT SELECT (manufacturer, model)
  ON public.vehicles TO fleetora_inspect;
GRANT SELECT (id)
  ON public.company_memberships TO fleetora_inspect;
GRANT SELECT (id)
  ON public.platform_admin_grants TO fleetora_inspect;
COMMIT;

-- These grants cover postflight.sql plus the existing preflight/history SQL.
-- A column SELECT grant permits COUNT(*) and makes that column visible in
-- information_schema.columns. Names, contacts and user credentials stay outside
-- the added grants.
-- They do NOT enable the installed Prisma CLI's complete marker projection or
-- privilege-filtered full-schema introspection. Run strict Prisma verification
-- in the separately approved deployment context; do not broaden this role to
-- SELECT ON ALL TABLES to make the CLI work.
