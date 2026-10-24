// Read-only diagnostic of the SAME config and control driver used by Prisma.
// No migration framework or migration command is invoked by this script.
import { MigrationSecurityError } from './secure-driver';

async function verify() {
  if (process.env.FLEETORA_MIGRATION_READ_ONLY !== '1') {
    throw new MigrationSecurityError('READ_ONLY_PROBE_REQUIRED');
  }
  const { default: config } = await import('../../prisma.production.config');
  const url = config.orm.db?.connection;
  if (typeof url !== 'string')
    throw new MigrationSecurityError('PRIVATE_CONFIGURATION_INVALID');
  const driver = await config.orm.driver.create(url);
  try {
    console.log(
      JSON.stringify({
        result: 'VERIFIED_READ_ONLY_CONNECTION',
        ...driver.security,
      }),
    );
  } finally {
    await driver.close();
  }
}

try {
  await verify();
} catch (error) {
  console.error(
    error instanceof MigrationSecurityError
      ? error.message
      : 'MIGRATION_SECURITY: PROBE_REJECTED',
  );
  process.exitCode = 1;
}
