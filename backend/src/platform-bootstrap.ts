import 'temporal-polyfill/full/global';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { PrismaService } from './modules/prisma/prisma.service.js';
import { MailModule } from './modules/mail/mail.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { PlatformService } from './modules/platform/platform.service.js';
import { bootstrapEmail } from './modules/platform/platform-policy.js';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    MailModule,
    PlatformModule,
  ],
})
class BootstrapModule {}
async function run() {
  const email = bootstrapEmail(process.argv.slice(2), process.env);
  const app = await NestFactory.createApplicationContext(BootstrapModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    await app.get(PlatformService).bootstrap(email);
    process.stdout.write(
      'Bootstrap invitation emailed. Open the activation link to set your password.\n',
    );
  } finally {
    await app.get(PrismaService).db.close();
    await app.close();
  }
}
run().catch((error: unknown) => {
  // Never print infrastructure errors, connection strings or activation credentials.
  const known =
    error instanceof Error &&
    /^(Platform bootstrap is already established|An account already uses this email|Bootstrap invitation saved; email delivery failed\. Rerun with the same email\.|A valid bootstrap email is required|Usage: platform:bootstrap)/.test(
      error.message,
    );
  process.stderr.write(
    known && error instanceof Error
      ? `${error.message}\n`
      : 'Bootstrap failed. Check database migrations and mail configuration.\n',
  );
  process.exitCode = 1;
});
