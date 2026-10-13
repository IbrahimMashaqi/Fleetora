import 'temporal-polyfill/full/global';
import { requireDisposableAuthTestDatabase } from './auth-postgres.safety.js';

const testDatabase = requireDisposableAuthTestDatabase(process.env);
process.env.DATABASE_URL = testDatabase.url;
process.env.FLEETORA_VERIFIED_TEST_DATABASE_NAME = testDatabase.databaseName;
