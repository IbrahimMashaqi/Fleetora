// Contract emission/migration planning only: no application env or remote URL.
import { fileURLToPath } from 'node:url';
import { definePrismaConfig } from 'prisma/config';
import { defineConfig } from '@prisma/orm-postgres/config';
export default definePrismaConfig({ orm: defineConfig({
  contract: fileURLToPath(new URL('../src/prisma/contract.prisma', import.meta.url)),
  output: fileURLToPath(new URL('../src/prisma/generated', import.meta.url)),
  migrations: { dir: fileURLToPath(new URL('../migrations', import.meta.url)) },
  db: { connection: 'postgresql://offline@127.0.0.1:1/fleetora_phase1_offline' },
}) });
