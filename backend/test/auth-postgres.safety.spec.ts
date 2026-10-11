import { describe, expect, it } from 'vitest';
import { requireDisposableAuthTestDatabase } from './auth-postgres.safety.js';

describe('auth PostgreSQL integration safety gate', () => {
  const approved = {
    FLEETORA_TEST_DATABASE_URL:
      'postgresql://fleetora_auth_test:secret@127.0.0.1:5432/fleetora_auth_test',
    FLEETORA_TEST_DATABASE_NAME: 'fleetora_auth_test',
    FLEETORA_ALLOW_DESTRUCTIVE_AUTH_TESTS: 'true',
  };

  it('accepts only an explicitly authorized local test database and role', () => {
    expect(requireDisposableAuthTestDatabase(approved)).toEqual({
      url: approved.FLEETORA_TEST_DATABASE_URL,
      databaseName: 'fleetora_auth_test',
    });
  });

  it.each([
    [{}, 'require FLEETORA_TEST_DATABASE_URL'],
    [
      { ...approved, FLEETORA_ALLOW_DESTRUCTIVE_AUTH_TESTS: 'false' },
      'explicit destructive-test authorization',
    ],
    [
      {
        ...approved,
        FLEETORA_TEST_DATABASE_URL:
          'postgresql://fleetora_auth_test:secret@db.example.com/fleetora_auth_test',
      },
      'local test-only database',
    ],
    [
      { ...approved, FLEETORA_TEST_DATABASE_NAME: 'fleetora_development' },
      'local test-only database',
    ],
  ])('fails closed for an unsafe environment', (environment, message) => {
    expect(() => requireDisposableAuthTestDatabase(environment)).toThrow(message);
  });
});
