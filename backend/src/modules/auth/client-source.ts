import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * Header set only by the Fleetora Next.js server (BFF). Its value is an HMAC
 * assertion of the browser's address, bound to the request method and path:
 * `v1.<unix-ms>.<base64url(ip or "")>.<hex hmac-sha256>`.
 */
export const CLIENT_SOURCE_HEADER = 'x-fleetora-client-source';

const MAX_AGE_MS = 60_000;
const MAX_FUTURE_SKEW_MS = 5_000;
const MAX_HEADER_LENGTH = 512;
const MIN_SECRET_LENGTH = 32;
const format = /^v1\.(\d{13})\.([A-Za-z0-9_-]{0,64})\.([a-f0-9]{64})$/;

export type ClientSourceRequest = {
  ip?: string;
  method: string;
  originalUrl: string;
  get(name: string): string | undefined;
};

export type ClientSource =
  | { kind: 'network'; address: string | undefined }
  | { kind: 'verified-client'; address: string }
  | { kind: 'unattributed' };

/** Rate-limit identity; null means "unattributed", which never shares a source bucket. */
export function rateLimitSource(source: ClientSource): string | null {
  if (source.kind === 'unattributed') return null;
  return `ip:${source.address ?? 'unknown'}`;
}

export function clientSourceMessage(method: string, path: string, timestamp: string, ip: string) {
  return `fleetora-client-source\nv1\n${method.toUpperCase()}\n${path}\n${timestamp}\n${ip}`;
}

@Injectable()
export class ClientSourceService {
  private readonly secret: Buffer | null;

  constructor(config: ConfigService) {
    const value = config.get<string>('FLEETORA_CLIENT_SOURCE_SECRET');
    // Without the secret every web sign-in would share the BFF's address as one rate-limit source.
    if (!value && config.get<string>('NODE_ENV') === 'production') {
      throw new Error('FLEETORA_CLIENT_SOURCE_SECRET must be configured in production');
    }
    if (value !== undefined && value !== '' && value.length < MIN_SECRET_LENGTH) {
      throw new Error(`FLEETORA_CLIENT_SOURCE_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    this.secret = value ? Buffer.from(value, 'utf8') : null;
  }

  /**
   * Forwarding headers (X-Forwarded-For, X-Real-IP, Forwarded) are never trusted.
   * Only a valid, fresh assertion signed with the shared frontend secret changes
   * the source; anything else falls back to the connection address.
   */
  resolve(request: ClientSourceRequest): ClientSource {
    const network: ClientSource = { kind: 'network', address: request.ip };
    const header = request.get(CLIENT_SOURCE_HEADER);
    if (!this.secret || !header || header.length > MAX_HEADER_LENGTH) return network;
    const match = format.exec(header);
    if (!match) return network;
    const [, timestamp, encodedIp, signature] = match;
    const age = Date.now() - Number(timestamp);
    if (age > MAX_AGE_MS || age < -MAX_FUTURE_SKEW_MS) return network;

    const ip = Buffer.from(encodedIp, 'base64url').toString('utf8');
    if (Buffer.from(ip, 'utf8').toString('base64url') !== encodedIp) return network;
    if (ip !== '' && !isIP(ip)) return network;

    const path = request.originalUrl.split('?')[0];
    const expected = createHmac('sha256', this.secret)
      .update(clientSourceMessage(request.method, path, timestamp, ip))
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return network;

    return ip === '' ? { kind: 'unattributed' } : { kind: 'verified-client', address: ip };
  }
}
