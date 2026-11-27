import type { ConfigService } from '@nestjs/config';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';

export function mailTransport(config: ConfigService): SMTPTransport.Options {
  const production = config.get<string>('NODE_ENV') === 'production';
  // This opt-in exists only in the local Compose environment. Production ignores it.
  if (!production && config.get<string>('FLEETORA_MAILPIT') === 'true') {
    return {
      host: 'mailpit',
      port: 1025,
      secure: false,
      ignoreTLS: true,
      logger: false,
      debug: false,
    };
  }
  const host = config.get<string>('MAIL_HOST');
  const user = config.get<string>('MAIL_USER');
  const pass = config.get<string>('MAIL_PASSWORD');
  if (
    production &&
    (!host?.trim() ||
      host.trim().toLowerCase() === 'mailpit' ||
      !user?.trim() ||
      !pass)
  ) {
    throw new Error(
      'Production SMTP requires a real MAIL_HOST, MAIL_USER and MAIL_PASSWORD; Mailpit is development-only',
    );
  }
  const configuredPort = config.get<number | string>('MAIL_PORT');
  const port =
    configuredPort === undefined || configuredPort === ''
      ? undefined
      : Number(configuredPort);
  if (
    port !== undefined &&
    (!Number.isInteger(port) || port < 1 || port > 65535)
  ) {
    throw new Error('Invalid MAIL_PORT');
  }
  // Preserve the existing authenticated, implicit-TLS SMTP configuration.
  return {
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
    debug: false,
  };
}
