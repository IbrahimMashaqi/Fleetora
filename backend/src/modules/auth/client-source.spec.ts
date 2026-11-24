import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLIENT_SOURCE_HEADER,
  ClientSourceService,
  rateLimitSource,
  type ClientSourceRequest,
} from './client-source.js';

const secret = 'client-source-test-secret-0123456789abcdef';
const now = Date.parse('2026-11-15T10:00:00.000Z');

function assertion(
  ip: string,
  {
    key = secret,
    method = 'POST',
    path = '/auth/signin',
    timestamp = now,
  }: { key?: string; method?: string; path?: string; timestamp?: number } = {},
) {
  const signature = createHmac('sha256', key)
    .update(`fleetora-client-source\nv1\n${method}\n${path}\n${timestamp}\n${ip}`)
    .digest('hex');
  return `v1.${timestamp}.${Buffer.from(ip).toString('base64url')}.${signature}`;
}

function request(
  headers: Record<string, string> = {},
  { ip = '10.0.0.5', method = 'POST', originalUrl = '/auth/signin' } = {},
): ClientSourceRequest {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { ip, method, originalUrl, get: (name: string) => lower[name.toLowerCase()] };
}

describe('ClientSourceService', () => {
  const service = new ClientSourceService(new ConfigService({ FLEETORA_CLIENT_SOURCE_SECRET: secret }));
  afterEach(() => vi.useRealTimers());
  const at = () => { vi.useFakeTimers(); vi.setSystemTime(now); };

  it('uses the connection address when no frontend assertion is present', () => {
    expect(service.resolve(request())).toEqual({ kind: 'network', address: '10.0.0.5' });
  });

  it('never trusts client-supplied forwarding headers', () => {
    const resolved = service.resolve(request({
      'X-Forwarded-For': '198.51.100.1', 'X-Real-IP': '198.51.100.2', Forwarded: 'for=198.51.100.3',
    }));
    expect(resolved).toEqual({ kind: 'network', address: '10.0.0.5' });
  });

  it('accepts a fresh assertion signed by the trusted frontend for this exact request', () => {
    at();
    for (const ip of ['198.51.100.7', '2001:db8::7']) {
      expect(service.resolve(request({ [CLIENT_SOURCE_HEADER]: assertion(ip) }))).toEqual({
        kind: 'verified-client', address: ip,
      });
    }
  });

  it('treats a signed assertion without an address as unattributed web traffic', () => {
    at();
    expect(service.resolve(request({ [CLIENT_SOURCE_HEADER]: assertion('') }))).toEqual({ kind: 'unattributed' });
  });

  it('ignores the query string when binding the assertion to the request path', () => {
    at();
    const resolved = service.resolve(request(
      { [CLIENT_SOURCE_HEADER]: assertion('198.51.100.7') },
      { originalUrl: '/auth/signin?retry=1' },
    ));
    expect(resolved).toEqual({ kind: 'verified-client', address: '198.51.100.7' });
  });

  it.each([
    ['a wrong key', () => assertion('198.51.100.7', { key: 'attacker-chosen-secret-0123456789abcdef' })],
    ['another path', () => assertion('198.51.100.7', { path: '/auth/forgot-password' })],
    ['another method', () => assertion('198.51.100.7', { method: 'GET' })],
    ['an expired timestamp', () => assertion('198.51.100.7', { timestamp: now - 61_000 })],
    ['a future timestamp', () => assertion('198.51.100.7', { timestamp: now + 6_000 })],
    ['a substituted address', () => assertion('198.51.100.7').replace(
      Buffer.from('198.51.100.7').toString('base64url'), Buffer.from('198.51.100.8').toString('base64url'))],
    ['a non-IP address', () => assertion('not-an-ip')],
    ['a list of addresses', () => assertion('198.51.100.7, 198.51.100.8')],
    ['an unknown version', () => assertion('198.51.100.7').replace(/^v1\./, 'v2.')],
    ['a truncated value', () => assertion('198.51.100.7').slice(0, 40)],
    ['an oversized value', () => `${assertion('198.51.100.7')}${'a'.repeat(600)}`],
  ])('falls back to the connection address for %s', (_name, build) => {
    at();
    expect(service.resolve(request({ [CLIENT_SOURCE_HEADER]: build() }))).toEqual({
      kind: 'network', address: '10.0.0.5',
    });
  });

  it('ignores assertions entirely when no shared secret is configured', () => {
    at();
    const unconfigured = new ClientSourceService(new ConfigService({}));
    expect(unconfigured.resolve(request({ [CLIENT_SOURCE_HEADER]: assertion('198.51.100.7') }))).toEqual({
      kind: 'network', address: '10.0.0.5',
    });
  });

  it.each([
    ['missing', {}],
    ['empty', { FLEETORA_CLIENT_SOURCE_SECRET: '' }],
  ])('refuses to start in production when the shared secret is %s', (_name, values) => {
    expect(() => new ClientSourceService(new ConfigService({ NODE_ENV: 'production', ...values })))
      .toThrow(/FLEETORA_CLIENT_SOURCE_SECRET must be configured in production/);
  });

  it('starts in production with a configured shared secret', () => {
    at();
    const production = new ClientSourceService(new ConfigService({
      NODE_ENV: 'production', FLEETORA_CLIENT_SOURCE_SECRET: secret,
    }));
    expect(production.resolve(request({ [CLIENT_SOURCE_HEADER]: assertion('198.51.100.7') }))).toEqual({
      kind: 'verified-client', address: '198.51.100.7',
    });
  });

  it('refuses to start with a guessable shared secret', () => {
    expect(() => new ClientSourceService(new ConfigService({ FLEETORA_CLIENT_SOURCE_SECRET: 'short' })))
      .toThrow(/FLEETORA_CLIENT_SOURCE_SECRET/);
  });

  it('maps sources to rate-limit identities without a shared unattributed bucket', () => {
    expect(rateLimitSource({ kind: 'network', address: '10.0.0.5' })).toBe('ip:10.0.0.5');
    expect(rateLimitSource({ kind: 'verified-client', address: '10.0.0.5' })).toBe('ip:10.0.0.5');
    expect(rateLimitSource({ kind: 'unattributed' })).toBeNull();
    expect(rateLimitSource({ kind: 'network', address: undefined })).toBe('ip:unknown');
  });
});
