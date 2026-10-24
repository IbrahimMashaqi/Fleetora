-- READ ONLY. Run only after preflight confirms this ledger and its columns exist.
-- Missing/incompatible ledger is a review blocker, not permission to invent rows.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT id, created_at, space, migration_name, migration_hash,
       origin_core_hash, origin_profile_hash,
       destination_core_hash, destination_profile_hash
FROM prisma_contract.ledger WHERE space = 'app' ORDER BY id DESC LIMIT 20;
ROLLBACK;
