import type { PrismaService } from '../src/modules/prisma/prisma.service.js';

export type AuthIntegrationDatabase = {
  url: string;
  databaseName: string;
  roleName: string;
};

export function requireDisposableAuthTestDatabase(
  environment: NodeJS.ProcessEnv,
): AuthIntegrationDatabase {
  const rawUrl = environment.FLEETORA_TEST_DATABASE_URL;
  const expectedName = environment.FLEETORA_TEST_DATABASE_NAME;
  if (!rawUrl || !expectedName) {
    throw new Error(
      'Auth integration tests require FLEETORA_TEST_DATABASE_URL and FLEETORA_TEST_DATABASE_NAME',
    );
  }
  if (environment.FLEETORA_ALLOW_DESTRUCTIVE_AUTH_TESTS !== 'true') {
    throw new Error(
      'Auth integration tests require explicit destructive-test authorization',
    );
  }

  let url: URL;
  try {
    // Do not let URL normalization hide whitespace, parameters or fragments.
    if (/[\s?#]/.test(rawUrl)) throw new Error();
    url = new URL(rawUrl);
    decodeURIComponent(url.password);
  } catch {
    throw new Error('Auth integration test database URL is invalid');
  }

  // Restrict identifiers to literal ASCII names: no encoded names, path segments,
  // driver aliases or connection-string query overrides.
  const databaseName = url.pathname.slice(1);
  const roleName = url.username;
  const testIdentifier = /^[a-z_][a-z0-9_]*_test$/;
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !localHosts.has(url.hostname) ||
    databaseName !== expectedName ||
    !testIdentifier.test(databaseName) ||
    databaseName.length > 63 ||
    !testIdentifier.test(roleName) ||
    roleName.length > 63 ||
    (url.port !== '' && (Number(url.port) < 1 || Number(url.port) > 65535))
  ) {
    throw new Error(
      'Auth integration tests require matching local test-only database and role names',
    );
  }

  // pg otherwise falls back to PGPORT when the URL omits a port.
  url.port ||= '5432';
  return { url: url.toString(), databaseName, roleName };
}
type ConnectedAuthTestIdentity = {
  databaseName: string;
  roleName: string;
  sessionRoleName: string;
};

// Read through the same runtime/pool used for all subsequent fixtures and tests.
export async function readAuthPostgresIdentity(prisma: PrismaService) {
  const query = prisma.db.raw.sql`
    SELECT current_database() AS "databaseName",
           current_user AS "roleName", session_user AS "sessionRoleName"
  `
    .returnsRow({
      databaseName: 'pg/text@1',
      roleName: 'pg/text@1',
      sessionRoleName: 'pg/text@1',
    })
    .build();
  return prisma.db.runtime().query(query);
}

export class AuthPostgresTestGuard {
  private verified = false;

  async verify(
    readIdentity: () => Promise<readonly ConnectedAuthTestIdentity[]>,
    environment: NodeJS.ProcessEnv = process.env,
  ): Promise<void> {
    this.verified = false;
    const expected = requireDisposableAuthTestDatabase(environment);
    if (environment.DATABASE_URL !== expected.url) {
      throw new Error(
        'PostgreSQL tests require the authorized runtime configuration',
      );
    }
    const identities = await readIdentity();
    const identity = identities[0];
    if (
      identities.length !== 1 ||
      identity?.databaseName !== expected.databaseName ||
      identity.roleName !== expected.roleName ||
      identity.sessionRoleName !== expected.roleName
    ) {
      throw new Error(
        'PostgreSQL test database or connected role verification failed',
      );
    }
    this.verified = true;
  }

  assertVerified(): void {
    if (!this.verified)
      throw new Error(
        'PostgreSQL test writes require successful target verification',
      );
  }

  async cleanup(action: () => Promise<void>): Promise<void> {
    if (this.verified) await action();
  }

  async teardown(
    cleanup: () => Promise<void>,
    close: () => Promise<void>,
  ): Promise<void> {
    try {
      await this.cleanup(cleanup);
    } finally {
      this.verified = false;
      await close();
    }
  }
}
