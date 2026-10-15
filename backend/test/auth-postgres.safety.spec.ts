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
      roleName: 'fleetora_auth_test',
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
    expect(() => requireDisposableAuthTestDatabase(environment)).toThrow(
      message,
    );
  });

  it.each([
    '?host=remote.example',
    '?user=administrator',
    '?port=6543',
    '?database=production',
    '?dbname=production',
    '?host=localhost&host=remote.example',
    '?%68ost=remote.example',
    '?sslmode=disable',
    '?',
    '#ignored',
    '#',
  ])('rejects connection parameters or fragments: %s', (suffix) => {
    expect(() =>
      requireDisposableAuthTestDatabase({
        ...approved,
        FLEETORA_TEST_DATABASE_URL:
          approved.FLEETORA_TEST_DATABASE_URL + suffix,
      }),
    ).toThrow();
  });

  it.each([
    'not-a-url',
    'postgresql:///fleetora_auth_test',
    'postgresql://127.0.0.1/fleetora_auth_test',
    'postgresql://fleetora_auth_test:secret@127.0.0.1/',
    'postgresql://fleetora_auth_test:secret@127.0.0.1/fleetora_auth_test/extra_test',
    'postgresql://fleetora_auth_test:secret@127.0.0.1/%66leetora_auth_test',
    'postgresql://%66leetora_auth_test:secret@127.0.0.1/fleetora_auth_test',
    'postgresql://fleetora_auth_test:secret@127.0.0.1:0/fleetora_auth_test',
    'postgresql://fleetora_auth_test:secret@127.0.0.1:65536/fleetora_auth_test',
    'postgresql://fleetora_auth_test:secret@127.0.0.1/%ZZ',
    'postgresql://fleetora_auth_test:%ZZ@127.0.0.1/fleetora_auth_test',
    ' postgresql://fleetora_auth_test:secret@127.0.0.1/fleetora_auth_test',
    'postgresql://fleetora_auth_test:secret@127.0.0.1/fleetora_auth_test\n',
  ])('rejects missing or ambiguous connection settings: %s', (url) => {
    expect(() =>
      requireDisposableAuthTestDatabase({
        ...approved,
        FLEETORA_TEST_DATABASE_URL: url,
      }),
    ).toThrow();
  });

  it('pins the default port instead of allowing PGPORT to choose the target', () => {
    expect(
      requireDisposableAuthTestDatabase({
        ...approved,
        FLEETORA_TEST_DATABASE_URL:
          'postgresql://fleetora_auth_test:secret@localhost/fleetora_auth_test',
        PGPORT: '6543',
      }).url,
    ).toBe(
      'postgresql://fleetora_auth_test:secret@localhost:5432/fleetora_auth_test',
    );
  });

  it('never includes credentials or the supplied URL in validation errors', () => {
    const url =
      'postgresql://fleetora_auth_test:do-not-disclose@127.0.0.1/fleetora_auth_test?host=remote.example';
    let message = '';
    try {
      requireDisposableAuthTestDatabase({
        ...approved,
        FLEETORA_TEST_DATABASE_URL: url,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('do-not-disclose');
    expect(message).not.toContain(url);
  });
});
