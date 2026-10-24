# Fleetora Prisma workflow

The application uses Prisma 8's contract-based PostgreSQL API. The source contract is `src/prisma/contract.prisma`; generated runtime metadata and types are in `src/prisma/generated/contract.json` and `contract.d.ts`. Preserve both generated files, every migration package and its reference snapshots.

NestJS persistence uses the existing injectable `PrismaService` in `src/modules/prisma/prisma.service.ts`. Repositories own tenant-scoped queries and transactions. Do not introduce a standalone client or bypass the authenticated actor/company context.

`prisma.config.ts` loads the private application `.env.local` / `.env` files and `DATABASE_URL`. It is not the hardened production migration entry point. Production inspection, preview, migration and strict verification must use `--config prisma.production.config.ts`, whose secure driver loads the explicitly selected private `FLEETORA_MIGRATION_ENV_FILE`, verifies the pinned endpoint, CA, hostname and required SCRAM channel binding. See the applicable reviewed procedure under `deployment/`; do not infer live state from old reports.

After an approved contract change, use `npm run contract:emit` to regenerate metadata. Review the additive migration, its parent/target hashes, references, constraints and effects on existing data before deployment. Never use `db init`, `db push`, resets or fabricated migration markers to reconcile an existing shared database. Remote migrations require explicit authorization.

Local checks from `backend`:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- --maxWorkers=1
npm.cmd run build:isolated
```

The typecheck disables declaration emission checks while emitting nothing; it still checks source, configuration and migration TypeScript. The production build uses the existing Nest build configuration. `build:isolated` builds a source copy in the OS temporary directory so a running backend's `dist` is preserved.

For database-backed regressions, `test/run-parcel-integration.cjs` creates and stops an owned loopback PostgreSQL 18 cluster, clears inherited database connection settings, applies the full migration chain and performs strict verification. Set `FLEETORA_PG_BIN` to a complete server-tool directory if it is not in the standard location, then pass the required `test/*.auth-integration.spec.ts` paths to the runner. The fixtures require an explicitly disposable `_test` database and role. Never run them against Neon or application credentials.
