import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { mailTransport } from './mail-transport.js';
import { createServer, type Socket } from 'node:net';
import nodemailer from 'nodemailer';

describe('local Mailpit and production SMTP boundary', () => {
  it('delivers to a loopback SMTP fixture without TLS, authentication or message logging', async () => {
    const sockets = new Set<Socket>();
    let delivered = false,
      authenticated = false;
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.write('220 fixture ESMTP\r\n');
      let pending = '',
        data = false;
      socket.on('data', (chunk) => {
        pending += chunk.toString();
        let end: number;
        while ((end = pending.indexOf('\r\n')) >= 0) {
          const line = pending.slice(0, end);
          pending = pending.slice(end + 2);
          if (data) {
            if (line === '.') {
              data = false;
              delivered = true;
              socket.write('250 Accepted\r\n');
            }
            continue;
          }
          if (/^(EHLO|HELO)/.test(line)) socket.write('250 fixture\r\n');
          else if (line === 'DATA') {
            data = true;
            socket.write('354 Send data\r\n');
          } else if (line === 'QUIT') socket.end('221 Bye\r\n');
          else if (line.startsWith('AUTH')) {
            authenticated = true;
            socket.write('535 Authentication not supported\r\n');
          } else socket.write('250 OK\r\n');
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('SMTP fixture did not bind');
    const transport = nodemailer.createTransport({
      ...mailTransport(new ConfigService({ FLEETORA_MAILPIT: 'true' })),
      host: '127.0.0.1',
      port: address.port,
      connectionTimeout: 1000,
      greetingTimeout: 1000,
      socketTimeout: 1000,
    });
    try {
      await transport.sendMail({
        from: 'fixture@example.invalid',
        to: 'fixture@example.invalid',
        subject: 'Local SMTP fixture',
        text: 'Local inbox transport check.',
      });
      expect(delivered).toBe(true);
      expect(authenticated).toBe(false);
    } finally {
      transport.close();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('uses unauthenticated plaintext SMTP only for explicitly enabled non-production Mailpit', () => {
    const transport = mailTransport(
      new ConfigService({ NODE_ENV: 'development', FLEETORA_MAILPIT: 'true' }),
    );
    expect(transport).toMatchObject({
      host: 'mailpit',
      port: 1025,
      secure: false,
      ignoreTLS: true,
      logger: false,
      debug: false,
    });
    expect(transport).not.toHaveProperty('auth');
  });
  it.each([
    {},
    {
      MAIL_HOST: 'mailpit',
      MAIL_PORT: '1025',
      MAIL_USER: 'fixture',
      MAIL_PASSWORD: 'fixture',
    },
    { FLEETORA_MAILPIT: 'true' },
  ])('requires real SMTP in production despite local flags: %j', (values) => {
    expect(() =>
      mailTransport(new ConfigService({ ...values, NODE_ENV: 'production' })),
    ).toThrow('Production SMTP');
  });
  it('preserves authenticated secure production transport even when a local flag is accidentally set', () => {
    const transport = mailTransport(
      new ConfigService({
        NODE_ENV: 'production',
        FLEETORA_MAILPIT: 'true',
        MAIL_HOST: 'smtp.example.invalid',
        MAIL_PORT: '465',
        MAIL_USER: 'fixture',
        MAIL_PASSWORD: 'fixture',
      }),
    );
    expect(transport).toMatchObject({
      host: 'smtp.example.invalid',
      port: 465,
      secure: true,
      auth: { user: 'fixture', pass: 'fixture' },
      logger: false,
      debug: false,
    });
    expect(transport).not.toHaveProperty('ignoreTLS');
  });
  it('keeps the existing real-SMTP configuration outside the local stack', () => {
    expect(
      mailTransport(
        new ConfigService({
          NODE_ENV: 'development',
          MAIL_HOST: 'smtp.example.invalid',
          MAIL_PORT: 587,
          MAIL_USER: 'fixture',
          MAIL_PASSWORD: 'fixture',
        }),
      ),
    ).toMatchObject({ host: 'smtp.example.invalid', port: 587, secure: true });
  });
});
