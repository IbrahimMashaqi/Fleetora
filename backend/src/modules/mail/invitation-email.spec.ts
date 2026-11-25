import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import { describe, expect, it, vi } from 'vitest';
import { MailService } from './mail.service.js';

const template = Handlebars.compile(
  readFileSync(new URL('./templates/invitation.hbs', import.meta.url), 'utf8'),
);

async function render(code?: string) {
  const sendMail = vi.fn();
  const service = new MailService({ sendMail } as unknown as ConstructorParameters<typeof MailService>[0]);
  await service.sendInvitationEmail({
    to: 'person@example.invalid',
    url: 'https://app.fleetora.test/auth/accept-invitation#token=' + 'a'.repeat(64),
    inviter: 'Fixture Logistics',
    role: 'ACCOUNTANT',
    expiresAt: '2026-11-27T10:15:30.123Z',
    code,
  });
  const [mail] = sendMail.mock.calls[0];
  // Attribute entities (e.g. &#x3D; for '=') are decoded by browsers and mail clients.
  const html = template(mail.context).replace(/&#x3D;/g, '=');
  return { mail, html };
}

describe('invitation email', () => {
  it('renders the one-time link, role and expiry in English and Arabic', async () => {
    const { mail, html } = await render();
    expect(mail).toMatchObject({ to: 'person@example.invalid', template: 'invitation' });
    expect(html).toContain(`href='https://app.fleetora.test/auth/accept-invitation#token=${'a'.repeat(64)}'`);
    expect(html).toContain('Fixture Logistics');
    expect(html).toContain('accountant');
    expect(html).toContain('محاسب');
    expect(html).toContain("dir='rtl'");
    expect(html).toContain('2026-11-27 10:15');
    expect(html).not.toContain('invitation code');
  });

  it('includes the merchant app code only when given', async () => {
    const { html } = await render('b'.repeat(64));
    expect(html).toContain('invitation code');
    expect(html).toContain('b'.repeat(64));
  });

  it('escapes inviter names', async () => {
    const sendMail = vi.fn();
    const service = new MailService({ sendMail } as unknown as ConstructorParameters<typeof MailService>[0]);
    await service.sendInvitationEmail({
      to: 'p@example.invalid',
      url: 'https://app.fleetora.test/x',
      inviter: '<script>x</script>',
      role: 'OWNER',
      expiresAt: '2026-11-27T10:15:30Z',
    });
    expect(template(sendMail.mock.calls[0][0].context)).not.toContain('<script>');
  });
});
