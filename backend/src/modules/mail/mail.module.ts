import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { MailController } from './mail.controller.js';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { fileURLToPath } from 'url';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
const templatesDir = fileURLToPath(new URL('./templates', import.meta.url));
@Global()
@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        template: {
          dir: templatesDir,
          adapter: new HandlebarsAdapter(),
        },
        transport: {
          host: config.get<string>('MAIL_HOST'),
          port: config.get<number>('MAIL_PORT'),
          secure: true,
          auth: {
            user: config.get<string>('MAIL_USER'),
            pass: config.get<string>('MAIL_PASSWORD'),
          },
        },
      }),
      inject: [ConfigService],
    }),
  ],

  providers: [MailService],
  controllers: [MailController],
  exports: [MailService],
})
export class MailModule {}
