import { definePrismaConfig } from 'prisma/config';
import { defineConfig } from '@prisma/orm-postgres/config';
import {
  createSecureMigrationDriver,
  readPrivateMigrationSettings,
  MigrationSecurityError,
} from './deployment/vehicle-management/secure-driver';

// Opt-in deployment entry point. Never loads the application's .env files.
// Select the existing private backup.env explicitly; its credential is kept in
// memory. The secure driver sets its own TLS and migration startup options.
const settings = readPrivateMigrationSettings(
  process.env.FLEETORA_MIGRATION_ENV_FILE,
);
const mode = process.env.FLEETORA_MIGRATION_READ_ONLY;
if (mode !== undefined && mode !== '1')
  throw new MigrationSecurityError('INVALID_INSPECTION_MODE');
export default definePrismaConfig({
  orm: {
    ...defineConfig({
      contract: './src/prisma/contract.prisma',
      output: './src/prisma/generated',
      db: { connection: settings.connectionUrl },
    }),
    driver: createSecureMigrationDriver({
      caFile: settings.caFile,
      readOnly: mode === '1',
    }),
  },
});
