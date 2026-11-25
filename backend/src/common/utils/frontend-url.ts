import type { ConfigService } from '@nestjs/config';

// The single trusted origin used in emailed links. Fails closed on anything
// that could smuggle credentials, a query, a fragment or plain HTTP in production.
export function trustedFrontendOrigin(config: ConfigService): string {
  const configured = config.get<string>('FRONTEND_URL');
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  if (!configured && isProduction) {
    throw new Error('FRONTEND_URL must be configured in production');
  }
  let url: URL;
  try {
    url = new URL(configured ?? 'http://localhost:3000');
  } catch {
    throw new Error('FRONTEND_URL must be a valid trusted frontend URL');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (isProduction && url.protocol !== 'https:')
  ) {
    throw new Error('FRONTEND_URL must be a valid trusted frontend URL');
  }
  return url.origin;
}
