import {
  createHmac,
  createHash,
  pbkdf2Sync,
  X509Certificate,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { createSecureContext, TLSSocket } from 'node:tls';

export const fixtureHost =
  'ep-morning-base-b1jhw9q2.c-5.eu-central-1.aws.neon.tech';
export const fixtureUser = 'fixture_backup';
export const fixturePassword = 'fictional-test-only-not-a-real-login';
export const fixtureUrl = `postgresql://${fixtureUser}:${fixturePassword}@${fixtureHost}/fleetora?sslmode=require&channel_binding=require&options=-c%20default_transaction_read_only%3Don`;
export const fixtureCa = new URL('./test-only.crt', import.meta.url);

function int(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
}
function frame(type: string, body: Buffer) {
  return Buffer.concat([Buffer.from(type), int(body.length + 4), body]);
}
const auth = (code: number, text = '') =>
  frame('R', Buffer.concat([int(code), Buffer.from(text)]));
const hmac = (key: Buffer, value: string) =>
  createHmac('sha256', key).update(value).digest();

// A disposable TLS + PostgreSQL wire-protocol peer. It has no database, files,
// persistence, or outbound connections. The real installed pg performs SCRAM.
export async function postgresFixture(
  options: {
    mechanisms?: string[];
    auth?: 'scram' | 'cleartext' | 'md5' | 'trust';
    invalidProof?: boolean;
    missingFinal?: boolean;
    untrustedCertificate?: boolean;
    wrongHostname?: boolean;
    wrongBranch?: boolean;
    wrongReadOnly?: boolean;
    refuseTls?: boolean;
  } = {},
) {
  const prefix = options.wrongHostname
    ? 'wrong-host-test-only'
    : options.untrustedCertificate
      ? 'untrusted-test-only'
      : 'test-only';
  const cert = readFileSync(new URL(`./${prefix}.crt`, import.meta.url));
  const key = readFileSync(new URL(`./${prefix}.key`, import.meta.url));
  const context = createSecureContext({ cert, key });
  const sockets = new Set<Socket>();
  const queries: string[] = [];
  const mechanismsSent: string[] = [];
  let passwordMessages = 0;
  let bindingVerified = false;
  const server = createServer((raw) => {
    sockets.add(raw);
    raw.on('error', () => {});
    raw.on('close', () => sockets.delete(raw));
    raw.once('data', () => {
      if (options.refuseTls) {
        raw.end('N');
        return;
      }
      raw.write('S');
      const socket = new TLSSocket(raw, {
        isServer: true,
        secureContext: context,
      });
      socket.on('error', () => {});
      let pending = Buffer.alloc(0);
      let startup = true;
      let nonce = '';
      let firstBare = '';
      let serverFirst = '';
      let readOnly = false;
      let scramStarted = false;
      const ready = () => {
        socket.write(auth(0));
        socket.write(frame('Z', Buffer.from('I')));
      };
      socket.on('data', (chunk: Buffer) => {
        pending = Buffer.concat([pending, chunk]);
        while (pending.length >= (startup ? 4 : 5)) {
          const length = pending.readInt32BE(startup ? 0 : 1);
          const total = startup ? length : length + 1;
          if (pending.length < total) break;
          const message = pending.subarray(0, total);
          pending = pending.subarray(total);
          if (startup) {
            startup = false;
            readOnly = message.includes(
              Buffer.from('default_transaction_read_only=on'),
            );
            if (options.auth === 'trust') ready();
            else if (options.auth === 'cleartext') socket.write(auth(3));
            else if (options.auth === 'md5')
              socket.write(
                frame('R', Buffer.concat([int(5), Buffer.alloc(4)])),
              );
            else
              socket.write(
                auth(
                  10,
                  (
                    options.mechanisms ?? [
                      'SCRAM-SHA-256',
                      'SCRAM-SHA-256-PLUS',
                    ]
                  ).join('\0') + '\0\0',
                ),
              );
          } else if (message[0] === 'p'.charCodeAt(0)) {
            passwordMessages++;
            const body = message.subarray(5);
            if (!scramStarted) {
              scramStarted = true;
              const end = body.indexOf(0);
              const mechanism = body.subarray(0, end).toString();
              mechanismsSent.push(mechanism);
              const initial = body.subarray(end + 5).toString();
              firstBare = initial.slice(initial.indexOf(',,') + 2);
              nonce = firstBare.split('r=')[1] + 'fixture-server-nonce';
              serverFirst = `r=${nonce},s=${Buffer.from('fictional-salt').toString('base64')},i=4096`;
              socket.write(auth(11, serverFirst));
            } else {
              const final = body.toString();
              const withoutProof = final.slice(0, final.lastIndexOf(',p='));
              const channelBinding = withoutProof.split(',')[0].slice(2);
              const certHash = createHash('sha256')
                .update(new X509Certificate(cert).raw)
                .digest();
              const expectedBinding = Buffer.concat([
                Buffer.from('p=tls-server-end-point,,'),
                certHash,
              ]).toString('base64');
              bindingVerified = channelBinding === expectedBinding;
              const salted = pbkdf2Sync(
                fixturePassword,
                Buffer.from('fictional-salt'),
                4096,
                32,
                'sha256',
              );
              const signature = hmac(
                hmac(salted, 'Server Key'),
                `${firstBare},${serverFirst},${withoutProof}`,
              ).toString('base64');
              if (!options.missingFinal)
                socket.write(
                  auth(
                    12,
                    `v=${options.invalidProof ? Buffer.alloc(32).toString('base64') : signature}`,
                  ),
                );
              ready();
            }
          } else if (message[0] === 'Q'.charCodeAt(0)) {
            const sql = message.subarray(5, -1).toString();
            queries.push(sql);
            if (sql.includes('AS connection_security')) {
              const value = JSON.stringify({
                database: 'fleetora',
                actor: fixtureUser,
                session_actor: fixtureUser,
                project: 'patient-mud-78406881',
                branch: options.wrongBranch
                  ? 'different-branch'
                  : 'br-square-queen-b1jmdng0',
                endpoint: 'ep-morning-base-b1jhw9q2',
                default_read_only: readOnly ? 'on' : 'off',
                transaction_read_only: options.wrongReadOnly
                  ? readOnly
                    ? 'off'
                    : 'on'
                  : readOnly
                    ? 'on'
                    : 'off',
                server_ssl: { ssl: false, version: null, cipher: null },
              });
              const field = Buffer.alloc(18);
              field.writeInt32BE(114, 6); // json OID
              field.writeInt16BE(-1, 10);
              field.writeInt32BE(-1, 12);
              socket.write(
                frame(
                  'T',
                  Buffer.concat([
                    Buffer.from([0, 1]),
                    Buffer.from('connection_security\0'),
                    field,
                  ]),
                ),
              );
              socket.write(
                frame(
                  'D',
                  Buffer.concat([
                    Buffer.from([0, 1]),
                    int(Buffer.byteLength(value)),
                    Buffer.from(value),
                  ]),
                ),
              );
              socket.write(frame('C', Buffer.from('SELECT 1\0')));
            } else
              socket.write(
                frame('C', Buffer.from(`${sql.trim().split(/\s+/)[0]}\0`)),
              );
            socket.write(frame('Z', Buffer.from('I')));
          } else if (message[0] === 'X'.charCodeAt(0)) socket.end();
        }
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Fixture listener unavailable');
  return {
    port: address.port,
    queries,
    mechanismsSent,
    get passwordMessages() {
      return passwordMessages;
    },
    get bindingVerified() {
      return bindingVerified;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
