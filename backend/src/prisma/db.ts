import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './generated/contract.d';
import contractJson from './generated/contract.json' with { type: 'json' };

export const db = postgres<Contract>({
  contractJson,
  url: process.env['DATABASE_URL']!,
});
