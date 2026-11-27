import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { trustedActivationOrigin } from './frontend-url.js';

describe('activation origin policy', () => {
  for (const mode of ['development', 'test', 'production']) {
    for (const host of ['localhost', '127.0.0.1', '[::1]', 'app.example.test', 'localhost.evil.test', '127.0.0.2']) {
      it(`${mode}: HTTP ${host}`, () => {
        const config = new ConfigService({ NODE_ENV: mode, FRONTEND_URL: `http://${host}:3000` });
        if (mode !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(host))
          expect(trustedActivationOrigin(config)).toBe(`http://${host}:3000`);
        else expect(() => trustedActivationOrigin(config)).toThrow(/FRONTEND_URL/);
      });
    }
    it(`${mode}: HTTPS remains allowed`, () => {
      expect(trustedActivationOrigin(new ConfigService({ NODE_ENV: mode, FRONTEND_URL: 'https://app.example.test' }))).toBe('https://app.example.test');
    });
  }
  for (const url of ['http://user:pass@localhost:3000', 'http://localhost:3000?token=x', 'http://localhost:3000#token=x']) {
    it(`rejects unsafe origin components: ${url}`, () => {
      expect(() => trustedActivationOrigin(new ConfigService({ FRONTEND_URL: url }))).toThrow(/FRONTEND_URL/);
    });
  }
});
