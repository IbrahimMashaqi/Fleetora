import 'temporal-polyfill/full/global';
import { requireDisposableAuthTestDatabase } from './auth-postgres.safety.js';

const testDatabase = requireDisposableAuthTestDatabase(process.env);
process.env.DATABASE_URL = testDatabase.url;
// URL approval is not connected-target verification. Each suite must verify the
// database and both connected roles through its own runtime before writing.
