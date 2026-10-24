import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg, { type ClientConfig } from 'pg';
import { PostgresControlDriver } from '@prisma/orm-postgres/driver/control';
import { executeMigrateShowPlan } from '@prisma/orm-toolchain/cli/control-api';
import { loadConfig } from '@prisma/orm-toolchain/config-loader';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSecureMigrationDriver,
  readPrivateMigrationSettings,
} from './secure-driver';
import {
  fixtureCa,
  fixtureHost,
  fixtureUrl,
  postgresFixture,
} from './test-support/postgres-server';
import { fileURLToPath } from 'node:url';

const caFile = fileURLToPath(fixtureCa);
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.unstubAllEnvs();
});
async function setup(
  options: Parameters<typeof postgresFixture>[0] = {},
  readOnly = false,
) {
  const server = await postgresFixture(options);
  cleanup.push(() => server.close());
  const construct = vi.fn(
    (config: ClientConfig & { enableChannelBinding: boolean }) =>
      new pg.Client({
        ...config,
        host: 'localhost',
        port: server.port,
        ssl:
          typeof config.ssl === 'object'
            ? { ...config.ssl, servername: fixtureHost }
            : config.ssl,
      }),
  );
  const selectedCa = options.wrongHostname
    ? fileURLToPath(
        new URL('./test-support/wrong-host-test-only.crt', import.meta.url),
      )
    : caFile;
  const descriptor = createSecureMigrationDriver(
    { caFile: selectedCa, readOnly },
    construct,
  );
  return { server, descriptor, construct };
}
describe('fail-closed production migration connection (real pg, TLS and SCRAM)', () => {
  it('requires verified TLS and actual SCRAM-PLUS server proof before exposing the Prisma driver', async () => {
    const { descriptor, server, construct } = await setup();
    const driver = await descriptor.create(fixtureUrl);
    cleanup.push(() => driver.close());
    expect(driver).toBeInstanceOf(PostgresControlDriver);
    expect(server.mechanismsSent).toEqual(['SCRAM-SHA-256-PLUS']);
    expect(server.bindingVerified).toBe(true);
    expect(driver.security.channelBinding).toBe('SCRAM-SHA-256-PLUS');
    expect(driver.security.tlsAuthorized).toBe(true);
    expect(driver.security.readOnly).toBe(false);
    expect(driver.security.serverSsl.ssl).toBe(false);
    const config = construct.mock.calls[0][0];
    expect(config.connectionString).toBeUndefined();
    expect(config.enableChannelBinding).toBe(true);
    expect(config.ssl).toMatchObject({
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      servername: fixtureHost,
    });
    expect(config.options).toContain('default_transaction_read_only=off');
    await driver.query('BEGIN');
    await driver.query('SELECT 1');
    await driver.query('ROLLBACK');
    expect(server.queries.slice(1)).toEqual(['BEGIN', 'SELECT 1', 'ROLLBACK']);
  });
  it('uses explicit read-only startup settings for the same driver in inspection mode', async () => {
    const { descriptor } = await setup({}, true);
    const driver = await descriptor.create(fixtureUrl);
    cleanup.push(() => driver.close());
    expect(driver.security.readOnly).toBe(true);
  });
  it('does not inherit URL or process backup-only options', async () => {
    vi.stubEnv('PGOPTIONS', '-c default_transaction_read_only=on');
    vi.stubEnv('PGSSLMODE', 'disable');
    const { descriptor } = await setup();
    const driver = await descriptor.create(fixtureUrl);
    cleanup.push(() => driver.close());
    expect(driver.security.readOnly).toBe(false);
    expect(driver.security.tlsAuthorized).toBe(true);
  });
  it.each([
    { mechanisms: ['SCRAM-SHA-256'] },
    { auth: 'cleartext' as const },
    { auth: 'md5' as const },
    { auth: 'trust' as const },
  ])(
    'refuses authentication fallback before sending credentials: %j',
    async (options) => {
      const { descriptor, server, construct } = await setup(options);
      await expect(descriptor.create(fixtureUrl)).rejects.toThrow(
        'MIGRATION_SECURITY',
      );
      expect(server.passwordMessages).toBe(0);
      expect(server.queries).toEqual([]);
      expect(construct).toHaveBeenCalledTimes(1);
    },
  );
  it.each([{ invalidProof: true }, { missingFinal: true }])(
    'rejects incomplete or invalid server proof: %j',
    async (options) => {
      const { descriptor, server, construct } = await setup(options);
      await expect(descriptor.create(fixtureUrl)).rejects.toThrow(
        'MIGRATION_SECURITY',
      );
      expect(server.queries).toEqual([]);
      expect(construct).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects certificate-chain verification failure without retrying', async () => {
    const { descriptor, server, construct } = await setup({
      untrustedCertificate: true,
    });
    await expect(descriptor.create(fixtureUrl)).rejects.toThrow(
      'MIGRATION_SECURITY',
    );
    expect(server.passwordMessages).toBe(0);
    expect(construct).toHaveBeenCalledTimes(1);
  });
  it('rejects a trusted certificate for the wrong hostname without authentication or retry', async () => {
    const { descriptor, server, construct } = await setup({
      wrongHostname: true,
    });
    await expect(descriptor.create(fixtureUrl)).rejects.toThrow(
      'MIGRATION_SECURITY',
    );
    expect(server.passwordMessages).toBe(0);
    expect(server.queries).toEqual([]);
    expect(construct).toHaveBeenCalledTimes(1);
  });
  it('does not reconnect without TLS when the server refuses TLS', async () => {
    const { descriptor, server, construct } = await setup({ refuseTls: true });
    await expect(descriptor.create(fixtureUrl)).rejects.toThrow(
      'MIGRATION_SECURITY',
    );
    expect(server.passwordMessages).toBe(0);
    expect(server.queries).toEqual([]);
    expect(construct).toHaveBeenCalledTimes(1);
  });
  it('refuses a read-only probe unless both server settings are on', async () => {
    const { descriptor, server } = await setup({ wrongReadOnly: true }, true);
    await expect(descriptor.create(fixtureUrl)).rejects.toThrow(
      'READ_ONLY_MODE_MISMATCH',
    );
    expect(server.queries).toHaveLength(1);
  });
  it('rejects a different production branch before exposing a query-capable driver', async () => {
    const { descriptor, server } = await setup({ wrongBranch: true });
    await expect(descriptor.create(fixtureUrl)).rejects.toThrow(
      'MIGRATION_SECURITY',
    );
    expect(server.queries).toHaveLength(1);
  });
  it.each(['missing', 'invalid'])(
    'rejects %s CA before opening a connection',
    async (kind) => {
      const temp = mkdtempSync(join(tmpdir(), 'fleetora-ca-'));
      cleanup.push(() => rmSync(temp, { recursive: true, force: true }));
      const bad = join(temp, 'ca.pem');
      if (kind === 'invalid') writeFileSync(bad, 'not a certificate');
      const construct = vi.fn((config: ClientConfig) => new pg.Client(config));
      const descriptor = createSecureMigrationDriver(
        { caFile: bad },
        construct,
      );
      await expect(descriptor.create(fixtureUrl)).rejects.toThrow(
        'MIGRATION_SECURITY',
      );
      expect(construct).not.toHaveBeenCalled();
    },
  );
  it.each([
    fixtureUrl.replace(fixtureHost, 'different.neon.tech'),
    fixtureUrl.replace(
      fixtureHost,
      fixtureHost.replace(
        'ep-morning-base-b1jhw9q2',
        'ep-morning-base-b1jhw9q2-pooler',
      ),
    ),
    fixtureUrl.replace('/fleetora?', '/other?'),
  ])('rejects an unapproved target before connecting', async (url) => {
    const construct = vi.fn((config: ClientConfig) => new pg.Client(config));
    await expect(
      createSecureMigrationDriver({ caFile }, construct).create(url),
    ).rejects.toThrow('MIGRATION_SECURITY');
    expect(construct).not.toHaveBeenCalled();
  });
  it('sanitizes unexpected connection failures without attaching the original error', async () => {
    const descriptor = createSecureMigrationDriver({ caFile }, () => {
      throw new Error(fixtureUrl);
    });
    try {
      await descriptor.create(fixtureUrl);
      expect.fail('Expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) throw error;
      expect(error.message).not.toContain(fixtureUrl);
      expect(error.cause).toBeUndefined();
    }
  });
});

describe('private production configuration', () => {
  it('loads the explicitly selected private file without importing application env files', () => {
    const temp = mkdtempSync(join(tmpdir(), 'fleetora-private-'));
    cleanup.push(() => rmSync(temp, { recursive: true, force: true }));
    const file = join(temp, 'backup.env');
    writeFileSync(
      file,
      `FLEETORA_BACKUP_DATABASE_URL="${fixtureUrl}"\nFLEETORA_BACKUP_SSLROOTCERT="${caFile.replaceAll('\\', '/')}"\n`,
    );
    expect(readPrivateMigrationSettings(file)).toEqual({
      connectionUrl: fixtureUrl,
      caFile: caFile.replaceAll('\\', '/'),
    });
  });
  it('fails closed without an explicit private configuration file', () => {
    expect(() => readPrivateMigrationSettings(undefined)).toThrow(
      'MIGRATION_SECURITY',
    );
  });
  it.each(['missing', 'duplicate'])(
    'rejects %s private settings without exposing their contents',
    (kind) => {
      const temp = mkdtempSync(join(tmpdir(), 'fleetora-private-'));
      cleanup.push(() => rmSync(temp, { recursive: true, force: true }));
      const file = join(temp, 'backup.env');
      const assignment = `FLEETORA_BACKUP_DATABASE_URL="${fixtureUrl}"\n`;
      writeFileSync(
        file,
        assignment +
          (kind === 'duplicate' ? assignment : '') +
          (kind === 'duplicate'
            ? `FLEETORA_BACKUP_SSLROOTCERT="${caFile}"\n`
            : ''),
      );
      expect(() => readPrivateMigrationSettings(file)).toThrow(
        'MIGRATION_SECURITY: PRIVATE_CONFIGURATION_INVALID',
      );
    },
  );
  it('wires the secured driver into Prisma and preserves the exact offline migration path', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'fleetora-private-'));
    cleanup.push(() => rmSync(temp, { recursive: true, force: true }));
    const file = join(temp, 'backup.env');
    writeFileSync(
      file,
      `FLEETORA_BACKUP_DATABASE_URL="${fixtureUrl}"\nFLEETORA_BACKUP_SSLROOTCERT="${caFile.replaceAll('\\', '/')}"\n`,
    );
    vi.stubEnv('FLEETORA_MIGRATION_ENV_FILE', file);
    vi.stubEnv('FLEETORA_MIGRATION_READ_ONLY', '1');
    const { default: config } = await import('../../prisma.production.config');
    expect(config.orm?.driver.targetId).toBe('postgres');
    expect(config.orm?.driver.create).toBeTypeOf('function');
    expect(config.orm?.db?.connection).toBe(fixtureUrl);
    const configPath = fileURLToPath(
      new URL('../../prisma.production.config.ts', import.meta.url),
    );
    const loaded = await loadConfig(configPath);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error('PRODUCTION_CONFIG_LOAD_FAILED');
    expect(loaded.value.diagnostics).toEqual([]);
    const forbiddenConnection = vi.fn(() => {
      throw new Error('OFFLINE_PREVIEW_MUST_NOT_CONNECT');
    });
    const preview = await executeMigrateShowPlan({
      config: loaded.value.config,
      configPath,
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      from: '316de1e8d9642428af4648bcae6927da9aa3df855b50b4a3456412f7e40dd902',
      to: '3dfdcd69d14fa5c5906a7720fd95d7cf6474d1535434f04efb18f0250c404303',
      createClient: forbiddenConnection,
    });
    expect(forbiddenConnection).not.toHaveBeenCalled();
    expect(preview.ok).toBe(true);
    if (!preview.ok) throw new Error('OFFLINE_PATH_PREVIEW_FAILED');
    expect(preview.value.usedLiveMarker).toBe(false);
    expect(
      preview.value.migrations.map((item) => ({
        name: item.dirName,
        hash: item.migrationHash,
      })),
    ).toEqual([
      {
        name: '20261014T0547_phase_7b1_authorization_foundation',
        hash: 'ccd5657a075d41ac54be4fbe0d5ec1473f7e3354e08eee74a26f3cf29370f5f9',
      },
      {
        name: '20261016T0622_vehicle_management',
        hash: '2421dd4426c73c729428ffa6fd2af72970c37e3466dd34d715b5911f159b898a',
      },
    ]);
  });
});
