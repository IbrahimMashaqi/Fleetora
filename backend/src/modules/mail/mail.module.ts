import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { fileURLToPath } from 'url';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { mailTransport } from './mail-transport.js';
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
        transport: mailTransport(config),
      }),
      inject: [ConfigService],
    }),
  ],

  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
