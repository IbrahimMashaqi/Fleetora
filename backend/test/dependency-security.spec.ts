import { createRequire } from 'node:module';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import express from 'express';
import { ExternalEditor } from 'external-editor';
import nodemailer from 'nodemailer';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const previewRequire = createRequire(require.resolve('preview-email'));
const preview: unknown = require('preview-email');
const nestedAddress =
  'Recipient (x(y) <other@example.invalid>) <recipient@example.invalid>';

describe('patched dependency compatibility (offline fixtures only)', () => {
  it('loads the Nest HTTP adapter against the installed Nest core', async () => {
    const { ExpressAdapter } = await import('@nestjs/platform-express');
    expect(new ExpressAdapter().getType()).toBe('express');
  });
  it('keeps the intended SMTP envelope recipient through nested comments', async () => {
    const transport = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
    });
    const result = await transport.sendMail({
      from: 'sender@example.invalid',
      to: nestedAddress,
      subject: 'Fictional dependency regression',
      text: 'Offline message; never sent to an SMTP server.',
    });
    expect(result.envelope.to).toEqual(['recipient@example.invalid']);
    expect(Buffer.isBuffer(result.message)).toBe(true);
    transport.close();
  });

  it('also fixes the parser used by optional email previews', () => {
    const parse: unknown = previewRequire('nodemailer/lib/addressparser');
    if (typeof parse !== 'function') throw new Error('Missing address parser');
    const recipients: unknown = parse(nestedAddress);
    expect(recipients).toEqual([
      expect.objectContaining({ address: 'recipient@example.invalid' }),
    ]);
  });

  it('renders optional previews without opening a browser or sending email', async () => {
    if (typeof preview !== 'function') throw new Error('Missing email preview');
    const html: unknown = await preview(
      {
        from: 'sender@example.invalid',
        to: 'recipient@example.invalid',
        subject: 'Fictional preview regression',
        text: 'Offline compatibility fixture',
      },
      {
        returnHTML: true,
        open: false,
        openSimulator: false,
        hasDownloadOriginalButton: false,
      },
    );
    expect(html).toEqual(expect.stringContaining('recipient@example.invalid'));
    expect(html).toEqual(
      expect.stringContaining('Offline compatibility fixture'),
    );
  });

  it('preserves bounded compressed JSON handling and rejects malformed input', async () => {
    const app = express();
    app.use(express.json({ limit: '128b' }));
    app.post('/fixture', (req, res) => res.json(req.body));
    const server = app.listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('No fixture port');
      const url = `http://127.0.0.1:${address.port}/fixture`;
      const compressed = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
        },
        body: gzipSync(Buffer.from('{"fixture":true}')),
      });
      expect(compressed.status).toBe(200);
      expect(await compressed.json()).toEqual({ fixture: true });
      const malformed = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid',
      });
      expect(malformed.status).toBe(400);
      await malformed.arrayBuffer();
      const oversized = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'x'.repeat(256) }),
      });
      expect(oversized.status).toBe(413);
      await oversized.arrayBuffer();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('preserves external-editor temporary-file creation and cleanup without launching an editor', () => {
    const editor = new ExternalEditor('Offline editor fixture', {
      prefix: 'fleetora-security-',
      postfix: '.txt',
      mode: 0o600,
    });
    try {
      expect(readFileSync(editor.tempFile, 'utf8')).toBe(
        'Offline editor fixture',
      );
    } finally {
      editor.cleanup();
    }
    expect(existsSync(editor.tempFile)).toBe(false);
  });
});
