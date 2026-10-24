import { fileURLToPath } from 'node:url';
import { definePrismaConfig } from 'prisma/config';
import { defineConfig } from '@prisma/orm-postgres/config';
import { requireDisposableAuthTestDatabase } from './auth-postgres.safety.js';

const database = requireDisposableAuthTestDatabase(process.env);
export default definePrismaConfig({ orm: defineConfig({
  contract: fileURLToPath(new URL('../src/prisma/contract.prisma', import.meta.url)),
  output: fileURLToPath(new URL('../src/prisma/generated', import.meta.url)),
  migrations: { dir: fileURLToPath(new URL('../migrations', import.meta.url)) },
  db: { connection: database.url },
}) });
