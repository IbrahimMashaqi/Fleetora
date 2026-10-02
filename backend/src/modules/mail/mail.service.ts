import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private mailerService: MailerService) {}

  async sendVerificationEmail(
    email: string,
    name: string,
    verificationTokenLink: string,
  ) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Nextask | Account Verification 🔑',
      template: 'confirm-email',
      from: '"Nextask Team" <onboarding@resend.dev>',
      context: {
        name: name,
        url: verificationTokenLink,
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
