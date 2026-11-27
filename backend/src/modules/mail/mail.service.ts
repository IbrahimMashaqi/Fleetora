import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

const INVITATION_ROLES = {
  SUPER_ADMIN: { en: 'platform super administrator', ar: 'المسؤول الأعلى للمنصة' },
  COMPANY_MANAGER: { en: 'platform company manager', ar: 'مدير الشركات في المنصة' },
  BILLING: { en: 'platform billing staff', ar: 'موظف فوترة المنصة' },
  SUPPORT: { en: 'platform support (read-only)', ar: 'دعم المنصة (قراءة فقط)' },
  COMPANY_ADMIN: { en: 'company administrator', ar: 'مسؤول الشركة' },
  ACCOUNTANT: { en: 'accountant', ar: 'محاسب' },
  OPERATIONS: { en: 'operations staff', ar: 'موظف العمليات' },
  WAREHOUSE: { en: 'warehouse staff', ar: 'موظف المستودع' },
  OWNER: { en: 'merchant owner', ar: 'مالك التاجر' },
  EMPLOYEE: { en: 'merchant employee', ar: 'موظف لدى التاجر' },
} as const;
export type InvitationRole = keyof typeof INVITATION_ROLES;

@Injectable()
export class MailService {
  constructor(private mailerService: MailerService) {}

  async sendVerificationEmail(
    email: string,
    name: string,
    verificationTokenLink: string,
    expiresInMinutes = 15,
  ) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Fleetora | Verify your email',
      template: 'confirm-email',
      from: '"Fleetora" <onboarding@resend.dev>',
      context: {
        name: name,
        url: verificationTokenLink,
        expiresInMinutes,
      },
    });
  }

  // `url` carries the one-time token; callers must never log it.
  async sendInvitationEmail(invitation: {
    to: string;
    url: string;
    inviter: string;
    role: InvitationRole;
    expiresAt: string;
    code?: string;
  }) {
    const role = INVITATION_ROLES[invitation.role];
    await this.mailerService.sendMail({
      to: invitation.to,
      subject: `Fleetora | You're invited to join ${invitation.inviter} · دعوة للانضمام`,
      template: 'invitation',
      from: '"Fleetora" <onboarding@resend.dev>',
      context: {
        inviter: invitation.inviter,
        roleEn: role.en,
        roleAr: role.ar,
        url: invitation.url,
        code: invitation.code,
        // ISO instant -> 'YYYY-MM-DD HH:MM' (UTC) for both languages.
        expiresAt: invitation.expiresAt.slice(0, 16).replace('T', ' '),
      },
    });
  }

  async sendResetPasswordEmail(email: string, name: string, url: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Nextask | Reset Password 🔑',
      template: 'reset-password',
      from: '"Nextask Team" <onboarding@resend.dev>',
      context: {
        name: name,
        url: url,
      },
    });
  }
}
