import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
// Always an owned, in-memory PostgreSQL engine. No environment URL is consumed.
const parent =
  'cb732e7410ed221c37e6d0e555810415ba5551ef7b1d2a81c12645466ac8236a';
describe('additive vehicle SQL and PostgreSQL constraints (disposable PGlite)', () => {
  let db: PGlite;
  let sql: string;
  beforeAll(async () => {
    db = await PGlite.create();
    sql = await readFile(
      new URL(
        '../../../deployment/vehicle-management/additive.review.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await db.exec(
      `CREATE SCHEMA prisma_contract;CREATE TABLE prisma_contract.marker(space text,core_hash text);CREATE TABLE public.company_memberships(id text);CREATE TABLE public.platform_admin_grants(id text);CREATE TABLE vehicles(id text PRIMARY KEY,"companyId" text NOT NULL,type text NOT NULL,"plateNumber" text NOT NULL);CREATE TABLE workers(id text PRIMARY KEY,"companyId" text NOT NULL,"vehicleId" text UNIQUE REFERENCES vehicles(id));`,
    );
  }, 30000);
  afterAll(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await db.exec(
      `TRUNCATE workers,vehicles;DELETE FROM prisma_contract.marker;ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS "vehicles_companyId_plateNumber_key";ALTER TABLE vehicles DROP COLUMN IF EXISTS manufacturer,DROP COLUMN IF EXISTS model;`,
    );
    await db.query('INSERT INTO prisma_contract.marker VALUES ($1,$2)', [
      'app',
      parent,
    ]);
    await db.exec(
      `INSERT INTO vehicles VALUES ('vehicle-a','company-a','CAR','TEST-A'),('vehicle-b','company-a','VAN','TEST-B');INSERT INTO workers VALUES ('driver-a','company-a','vehicle-a'),('driver-b','company-a',NULL);`,
    );
  });
  it('adds nullable brand/model and uniqueness while preserving legacy IDs and assignments', async () => {
    await db.exec(sql);
    expect(
      (await db.query('SELECT manufacturer,model FROM vehicles')).rows,
    ).toEqual([
      { manufacturer: null, model: null },
      { manufacturer: null, model: null },
    ]);
    expect(
      (
        await db.query('SELECT "vehicleId" FROM workers WHERE id=$1', [
          'driver-a',
        ])
      ).rows,
    ).toEqual([{ vehicleId: 'vehicle-a' }]);
    expect(
      (await db.query('SELECT count(*)::int AS total FROM vehicles')).rows,
    ).toEqual([{ total: 2 }]);
  });
  it('refuses known marker drift without changing the schema', async () => {
    await db.query('UPDATE prisma_contract.marker SET core_hash=$1', [
      '316de1e8',
    ]);
    await expect(db.exec(sql)).rejects.toThrow('parent contract mismatch');
    await db.exec('ROLLBACK');
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS total FROM information_schema.columns WHERE table_name='vehicles' AND column_name='manufacturer'",
        )
      ).rows,
    ).toEqual([{ total: 0 }]);
  });
  it('enforces company plate uniqueness without blocking another company', async () => {
    await db.exec(sql);
    await expect(
      db.exec(
        `INSERT INTO vehicles(id,"companyId",type,"plateNumber") VALUES ('duplicate','company-a','CAR','TEST-A')`,
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await db.exec(
      `INSERT INTO vehicles(id,"companyId",type,"plateNumber") VALUES ('other','company-b','CAR','TEST-A')`,
    );
  });
  it('enforces unique vehicle assignment and preserves prior state after a failed replacement', async () => {
    await db.exec(sql);
    await expect(
      db.transaction(async (tx) => {
        await tx.query('UPDATE workers SET "vehicleId"=$1 WHERE id=$2', [
          'vehicle-a',
          'driver-b',
        ]);
      }),
    ).rejects.toMatchObject({ code: '23505' });
    expect(
      (
        await db.query('SELECT "vehicleId" FROM workers WHERE id=$1', [
          'driver-a',
        ])
      ).rows,
    ).toEqual([{ vehicleId: 'vehicle-a' }]);
    expect(
      (
        await db.query('SELECT "vehicleId" FROM workers WHERE id=$1', [
          'driver-b',
        ])
      ).rows,
    ).toEqual([{ vehicleId: null }]);
  });
  it('rejects normalized duplicate legacy plates before adding columns', async () => {
    await db.exec(
      `INSERT INTO vehicles VALUES ('case-duplicate','company-a','CAR','test-a')`,
    );
    await expect(db.exec(sql)).rejects.toThrow('duplicate company plates');
    await db.exec('ROLLBACK');
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS total FROM information_schema.columns WHERE table_name='vehicles' AND column_name='model'",
        )
      ).rows,
    ).toEqual([{ total: 0 }]);
  });
  it('refuses legacy cross-company assignments before modifying columns', async () => {
    await db.exec(
      `UPDATE workers SET "companyId"='company-b' WHERE id='driver-a'`,
    );
    await expect(db.exec(sql)).rejects.toThrow('cross-company assignments');
    await db.exec('ROLLBACK');
  });
  it('blocks schema rollback when saved brand/model data would be lost', async () => {
    await db.exec(sql);
    await db.exec(
      `UPDATE vehicles SET manufacturer='Toyota' WHERE id='vehicle-a'`,
    );
    const rollback = await readFile(
      new URL(
        '../../../deployment/vehicle-management/rollback.review.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await expect(db.exec(rollback)).rejects.toThrow('brand/model data');
    await db.exec('ROLLBACK');
    expect(
      (
        await db.query('SELECT manufacturer FROM vehicles WHERE id=$1', [
          'vehicle-a',
        ])
      ).rows,
    ).toEqual([{ manufacturer: 'Toyota' }]);
  });
  it('can reverse unused additive columns while preserving driver assignments', async () => {
    await db.exec(sql);
    const rollback = await readFile(
      new URL(
        '../../../deployment/vehicle-management/rollback.review.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await db.exec(rollback);
    expect(
      (
        await db.query('SELECT "vehicleId" FROM workers WHERE id=$1', [
          'driver-a',
        ])
      ).rows,
    ).toEqual([{ vehicleId: 'vehicle-a' }]);
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS total FROM information_schema.columns WHERE table_name='vehicles' AND column_name IN ('manufacturer','model')",
        )
      ).rows,
    ).toEqual([{ total: 0 }]);
  });
});
