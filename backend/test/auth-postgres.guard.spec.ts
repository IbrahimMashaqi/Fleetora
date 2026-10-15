import { describe, expect, it } from 'vitest';
import { AuthPostgresTestGuard } from './auth-postgres.safety.js';

const environment = {
  FLEETORA_TEST_DATABASE_URL:
    'postgresql://fleetora_auth_test:secret@127.0.0.1:5432/fleetora_auth_test',
  FLEETORA_TEST_DATABASE_NAME: 'fleetora_auth_test',
  FLEETORA_ALLOW_DESTRUCTIVE_AUTH_TESTS: 'true',
  DATABASE_URL:
    'postgresql://fleetora_auth_test:secret@127.0.0.1:5432/fleetora_auth_test',
};
const identity = {
  databaseName: 'fleetora_auth_test',
  roleName: 'fleetora_auth_test',
  sessionRoleName: 'fleetora_auth_test',
};

describe('PostgreSQL fixture and cleanup verification boundary (offline)', () => {
  it.each(
    [
      [],
      [identity, identity],
      [{ ...identity, databaseName: 'unexpected_test' }],
      [{ ...identity, roleName: 'administrator' }],
      [{ ...identity, sessionRoleName: 'administrator' }],
    ].map((rows) => ({ rows })),
  )(
    'skips cleanup and blocks fixtures after unexpected identity: $rows',
    async ({ rows }) => {
      const guard = new AuthPostgresTestGuard();
      const effects: string[] = [];
      await expect(
        guard.verify(async () => rows, environment),
      ).rejects.toThrow();
      expect(() => guard.assertVerified()).toThrow();
      await guard.teardown(
        async () => {
          effects.push('delete');
        },
        async () => {
          effects.push('close');
        },
      );
      expect(effects).toEqual(['close']);
    },
  );

  it('closes resources without cleanup when the identity query fails', async () => {
    const guard = new AuthPostgresTestGuard();
    const effects: string[] = [];
    await expect(
      guard.verify(async () => {
        throw new Error('query failed');
      }, environment),
    ).rejects.toThrow('query failed');
    await guard.teardown(
      async () => {
        effects.push('delete');
      },
      async () => {
        effects.push('close');
      },
    );
    expect(effects).toEqual(['close']);
  });

  it('denies cleanup and fixtures before verification has occurred', async () => {
    const guard = new AuthPostgresTestGuard();
    const effects: string[] = [];
    expect(() => guard.assertVerified()).toThrow();
    await guard.cleanup(async () => {
      effects.push('delete');
    });
    expect(effects).toEqual([]);
  });

  it('permits fixtures and cleanup only after both database and role match', async () => {
    const guard = new AuthPostgresTestGuard();
    const effects: string[] = [];
    await guard.verify(async () => [identity], environment);
    guard.assertVerified();
    effects.push('insert');
    await guard.teardown(
      async () => {
        effects.push('delete');
      },
      async () => {
        effects.push('close');
      },
    );
    expect(effects).toEqual(['insert', 'delete', 'close']);
    expect(() => guard.assertVerified()).toThrow();
  });

  it('still closes resources and disables writes when verified cleanup fails', async () => {
    const guard = new AuthPostgresTestGuard();
    const effects: string[] = [];
    await guard.verify(async () => [identity], environment);
    await expect(
      guard.teardown(
        async () => {
          throw new Error('cleanup failed');
        },
        async () => {
          effects.push('close');
        },
      ),
    ).rejects.toThrow('cleanup failed');
    expect(effects).toEqual(['close']);
    expect(() => guard.assertVerified()).toThrow();
  });

  it('clears previous verification when re-verification fails', async () => {
    const guard = new AuthPostgresTestGuard();
    await guard.verify(async () => [identity], environment);
    await expect(guard.verify(async () => [], environment)).rejects.toThrow();
    expect(() => guard.assertVerified()).toThrow();
  });

  it('rejects changed runtime configuration before reading any database', async () => {
    const guard = new AuthPostgresTestGuard();
    let reads = 0;
    await expect(
      guard.verify(
        async () => {
          reads++;
          return [identity];
        },
        {
          ...environment,
          DATABASE_URL: 'unexpected',
        },
      ),
    ).rejects.toThrow();
    expect(reads).toBe(0);
  });
});
