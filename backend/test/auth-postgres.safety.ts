export type AuthIntegrationDatabase = {
  url: string;
  databaseName: string;
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
    url = new URL(rawUrl);
  } catch {
    throw new Error('Auth integration test database URL is invalid');
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !localHosts.has(url.hostname) ||
    databaseName !== expectedName ||
    !databaseName.endsWith('_test') ||
    !url.username.endsWith('_test')
  ) {
    throw new Error(
      'Auth integration tests require matching local test-only database and role names',
    );
  }

  return { url: rawUrl, databaseName };
}
