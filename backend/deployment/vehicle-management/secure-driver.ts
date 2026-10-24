import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { checkServerIdentity, TLSSocket } from 'node:tls';
import { parse } from 'dotenv';
import pg, { type ClientConfig } from 'pg';
import pgPackage from 'pg/package.json' with { type: 'json' };
import postgresDriver, {
  PostgresControlDriver,
} from '@prisma/orm-postgres/driver/control';

const endpoint = 'ep-morning-base-b1jhw9q2';
const project = 'patient-mud-78406881';
const branch = 'br-square-queen-b1jmdng0';
const plus = 'SCRAM-SHA-256-PLUS';
type SecureClientConfig = ClientConfig & { enableChannelBinding: true };
type ClientFactory = (config: SecureClientConfig) => pg.Client;
type SaslConnection = pg.Client['connection'] & {
  sendSASLInitialResponseMessage(
    mechanism: string,
    initialResponse: string,
  ): void;
};

export class MigrationSecurityError extends Error {
  constructor(code: string) {
    super(`MIGRATION_SECURITY: ${code}`);
    this.name = 'MigrationSecurityError';
  }
}
const fail = (code: string): never => {
  throw new MigrationSecurityError(code);
};
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
function hasSaslSender(
  connection: pg.Client['connection'],
): connection is SaslConnection {
  return (
    'sendSASLInitialResponseMessage' in connection &&
    typeof connection.sendSASLInitialResponseMessage === 'function'
  );
}
function trustedTls(client: pg.Client, host: string): TLSSocket | undefined {
  const socket = client.connection.stream;
  if (
    !(socket instanceof TLSSocket) ||
    !socket.encrypted ||
    !socket.authorized ||
    socket.authorizationError
  )
    return;
  if (
    !socket.getPeerCertificate().raw ||
    checkServerIdentity(host, socket.getPeerCertificate())
  )
    return;
  if (!['TLSv1.2', 'TLSv1.3'].includes(socket.getProtocol() ?? '')) return;
  return socket;
}
function readCa(file: string): string {
  try {
    if (!isAbsolute(file)) return fail('CA_PATH_MUST_BE_ABSOLUTE');
    const text = readFileSync(file, 'utf8');
    const certificates =
      text.match(
        /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
      ) ?? [];
    const parsed = certificates.map((pem) => new X509Certificate(pem));
    const now = Date.now();
    if (
      !parsed.some(
        (cert) =>
          cert.ca &&
          Date.parse(cert.validFrom) <= now &&
          Date.parse(cert.validTo) > now,
      )
    )
      return fail('INVALID_CA_BUNDLE');
    return text;
  } catch {
    return fail('INVALID_CA_BUNDLE');
  }
}

export function readPrivateMigrationSettings(file: string | undefined) {
  try {
    if (!file || !isAbsolute(file))
      return fail('EXPLICIT_PRIVATE_ENV_FILE_REQUIRED');
    const text = readFileSync(file, 'utf8');
    const values = parse(text);
    for (const name of [
      'FLEETORA_BACKUP_DATABASE_URL',
      'FLEETORA_BACKUP_SSLROOTCERT',
    ]) {
      if (
        (text.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`, 'gm')) ?? [])
          .length !== 1 ||
        !values[name]?.trim()
      )
        return fail('PRIVATE_CONFIGURATION_INVALID');
    }
    return {
      connectionUrl: values.FLEETORA_BACKUP_DATABASE_URL,
      caFile: values.FLEETORA_BACKUP_SSLROOTCERT,
    };
  } catch {
    return fail('PRIVATE_CONFIGURATION_INVALID');
  }
}

export type MigrationConnectionSecurity = {
  tlsAuthorized: true;
  tlsProtocol: string;
  tlsCipher: string;
  channelBinding: 'SCRAM-SHA-256-PLUS';
  readOnly: boolean;
  productionIdentityVerified: true;
  serverSsl: {
    ssl: boolean | null;
    version: string | null;
    cipher: string | null;
  };
};
export class SecurePostgresControlDriver extends PostgresControlDriver {
  constructor(
    client: pg.Client,
    readonly security: MigrationConnectionSecurity,
  ) {
    super(client);
  }
}

const connectionInspection = `SELECT json_build_object(
  'database', current_database(), 'actor', current_user, 'session_actor', session_user,
  'project', current_setting('neon.project_id', true),
  'branch', current_setting('neon.branch_id', true),
  'endpoint', current_setting('neon.endpoint_id', true),
  'default_read_only', current_setting('default_transaction_read_only'),
  'transaction_read_only', current_setting('transaction_read_only'),
  'server_ssl', (SELECT json_build_object('ssl', ssl, 'version', version, 'cipher', cipher)
                 FROM pg_stat_ssl WHERE pid = pg_backend_pid())
) AS connection_security`;

/** Dedicated production control driver. The application/runtime driver is untouched. */
export function createSecureMigrationDriver(
  settings: { caFile: string; readOnly?: boolean },
  construct: ClientFactory = (config) => new pg.Client(config),
) {
  return {
    ...postgresDriver,
    async create(connectionUrl: string): Promise<SecurePostgresControlDriver> {
      let client: pg.Client | undefined;
      try {
        // The event/sender seam below is audited against this exact installed pg.
        // An upgrade must be reviewed and run through the protocol regression tests.
        if (pgPackage.version !== '8.22.0')
          return fail('UNREVIEWED_PG_VERSION');
        const url = new URL(connectionUrl);
        const user = decodeURIComponent(url.username);
        if (
          !['postgres:', 'postgresql:'].includes(url.protocol) ||
          !user ||
          !url.password ||
          decodeURIComponent(url.pathname) !== '/fleetora' ||
          url.hostname.split('.')[0] !== endpoint ||
          !url.hostname.endsWith('.neon.tech') ||
          (url.port && url.port !== '5432')
        )
          return fail('UNAPPROVED_CONNECTION_TARGET');
        const readOnly = settings.readOnly === true;
        if (!readOnly && user === 'fleetora_inspect')
          return fail('INSPECTION_ROLE_CANNOT_MIGRATE');
        const ca = readCa(settings.caFile);
        // Never pass connectionString: pg URL parsing can replace SSL options.
        // URL options and PGOPTIONS cannot carry backup-only read-only settings in.
        const activeClient = construct({
          host: url.hostname,
          port: 5432,
          database: 'fleetora',
          user,
          password: decodeURIComponent(url.password),
          enableChannelBinding: true,
          ssl: {
            ca,
            rejectUnauthorized: true,
            servername: url.hostname,
            minVersion: 'TLSv1.2',
            checkServerIdentity,
          },
          options: `-c default_transaction_read_only=${readOnly ? 'on' : 'off'} -c lock_timeout=5000 -c statement_timeout=60000`,
          application_name: 'fleetora_secure_production_control',
          connectionTimeoutMillis: 15000,
          query_timeout: 65000,
        });
        client = activeClient;
        activeClient.on('error', () => {}); // Never log raw driver/connection errors.
        const connection = activeClient.connection;
        if (!hasSaslSender(connection))
          return fail('UNSUPPORTED_PG_AUTHENTICATION_INTERFACE');
        let failed = false;
        let initialPlusSent = false;
        let finalReceived = false;
        let authOkReceived = false;
        const rejectAuthentication = (eventName: string) => {
          failed = true;
          // Prevent the normal handler from sending a password or fallback proof.
          connection.removeAllListeners(eventName);
          connection.emit(
            'error',
            new MigrationSecurityError('CHANNEL_BINDING_REQUIRED'),
          );
          connection.stream.destroy();
        };
        const sendInitial =
          connection.sendSASLInitialResponseMessage.bind(connection);
        connection.sendSASLInitialResponseMessage = (
          mechanism,
          initialResponse,
        ) => {
          if (mechanism !== plus || !trustedTls(activeClient, url.hostname))
            return rejectAuthentication('authenticationSASL');
          initialPlusSent = true; // Observe the actual outbound mechanism, never its secret response.
          sendInitial(mechanism, initialResponse);
        };
        // pg emits this protocol event BEFORE its individual authentication handler.
        connection.on('message', (message: unknown) => {
          if (
            !record(message) ||
            typeof message.name !== 'string' ||
            !message.name.startsWith('authentication')
          )
            return;
          if (message.name === 'authenticationSASL') {
            if (
              failed ||
              initialPlusSent ||
              !Array.isArray(message.mechanisms) ||
              !message.mechanisms.includes(plus) ||
              !trustedTls(activeClient, url.hostname)
            )
              return rejectAuthentication(message.name);
            message.mechanisms = [plus]; // pg cannot select unbound SCRAM, even if offered.
          } else if (message.name === 'authenticationSASLFinal') {
            if (!initialPlusSent || finalReceived)
              return rejectAuthentication(message.name);
            finalReceived = true;
          } else if (message.name === 'authenticationOk') {
            if (!initialPlusSent || !finalReceived)
              return rejectAuthentication(message.name);
            authOkReceived = true;
          } else if (message.name !== 'authenticationSASLContinue')
            rejectAuthentication(message.name);
        });
        // pg validates the server's SCRAM signature in its untouched SASL-final
        // handler. Failure rejects connect(). No query-capable driver is exposed
        // unless that proof AND ReadyForQuery complete successfully.
        await client.connect();
        const tls = trustedTls(client, url.hostname);
        if (
          failed ||
          !initialPlusSent ||
          !finalReceived ||
          !authOkReceived ||
          !tls
        )
          return fail('CHANNEL_BINDING_OR_TLS_NOT_VERIFIED');
        const result = await client.query<{ connection_security: unknown }>(
          connectionInspection,
        );
        const evidence = result.rows[0]?.connection_security;
        if (
          !record(evidence) ||
          evidence.database !== 'fleetora' ||
          evidence.actor !== user ||
          evidence.session_actor !== user ||
          evidence.project !== project ||
          evidence.branch !== branch ||
          evidence.endpoint !== endpoint
        )
          return fail('PRODUCTION_IDENTITY_MISMATCH');
        const expectedReadOnly = readOnly ? 'on' : 'off';
        if (
          evidence.default_read_only !== expectedReadOnly ||
          evidence.transaction_read_only !== expectedReadOnly
        )
          return fail('READ_ONLY_MODE_MISMATCH');
        const serverSsl = evidence.server_ssl;
        return new SecurePostgresControlDriver(client, {
          tlsAuthorized: true,
          tlsProtocol: tls.getProtocol() ?? 'unknown',
          tlsCipher: tls.getCipher().standardName ?? tls.getCipher().name,
          channelBinding: plus,
          readOnly,
          productionIdentityVerified: true,
          // This observes Neon's backend leg; client TLS above is mandatory.
          serverSsl: {
            ssl:
              record(serverSsl) && typeof serverSsl.ssl === 'boolean'
                ? serverSsl.ssl
                : null,
            version:
              record(serverSsl) && typeof serverSsl.version === 'string'
                ? serverSsl.version
                : null,
            cipher:
              record(serverSsl) && typeof serverSsl.cipher === 'string'
                ? serverSsl.cipher
                : null,
          },
        });
      } catch (error) {
        if (client) await client.end().catch(() => {});
        if (error instanceof MigrationSecurityError) throw error;
        // Do not attach a cause: upstream CLI serialization may include secrets.
        throw new MigrationSecurityError('CONNECTION_REJECTED');
      }
    },
  };
}
