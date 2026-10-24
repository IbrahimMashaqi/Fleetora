import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import baselineOps from '../../migrations/app/20261014T0546_baseline/ops.json' with { type: 'json' };
import foundationOps from '../../migrations/app/20261014T0547_phase_7b1_authorization_foundation/ops.json' with { type: 'json' };
import vehicleOps from '../../migrations/app/20261016T0622_vehicle_management/ops.json' with { type: 'json' };
import contract from '../../migrations/snapshots/3dfdcd69d14fa5c5906a7720fd95d7cf6474d1535434f04efb18f0250c404303/contract.json' with { type: 'json' };

type Statement = { sql: string; params?: unknown[] };
type Operation = {
  operationClass: string;
  execute: Statement[];
  precheck?: Statement[];
  postcheck?: Statement[];
};
// SQL rehearsal only. No connection URL, network driver, app singleton, or env
// loading. Fixture markers are NOT evidence that Prisma runner/ledger was tested.
describe('recorded baseline to vehicle DDL rehearsal (owned PGlite only)', () => {
  let db: PGlite;
  async function apply(
    operations: Operation[],
    connection: Pick<PGlite, 'query'> = db,
  ) {
    for (const operation of operations) {
      for (const check of operation.precheck ?? []) {
        expect((await connection.query(check.sql, check.params)).rows).toEqual([
          { result: true },
        ]);
      }
      for (const statement of operation.execute)
        await connection.query(statement.sql, statement.params);
      for (const check of operation.postcheck ?? []) {
        expect((await connection.query(check.sql, check.params)).rows).toEqual([
          { result: true },
        ]);
      }
    }
  }
  const sql = (name: string) =>
    readFile(new URL(`./${name}`, import.meta.url), 'utf8');
  beforeAll(async () => {
    db = await PGlite.create();
  }, 30000);
  afterAll(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await db.exec(
      'DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS prisma_contract CASCADE;',
    );
    await apply(baselineOps);
    await db.exec(`CREATE SCHEMA prisma_contract;
      CREATE TABLE prisma_contract.marker(space text PRIMARY KEY, core_hash text, profile_hash text);
      INSERT INTO prisma_contract.marker VALUES ('app','cb732e7410ed221c37e6d0e555810415ba5551ef7b1d2a81c12645466ac8236a','fixture-only');
      INSERT INTO companies(id,name,"updatedAt") VALUES ('company-a','Fictional A',now()),('company-b','Fictional B',now());
      INSERT INTO vehicles(id,"companyId",type,"plateNumber","updatedAt") VALUES ('vehicle-a','company-a','CAR','DEMO-A',now()),('vehicle-b','company-a','VAN','DEMO-B',now());
      INSERT INTO workers(id,"companyId","fullName",phone,"updatedAt","vehicleId") VALUES ('driver-a','company-a','Fictional Driver A','fixture-only',now(),'vehicle-a'),('driver-b','company-a','Fictional Driver B','fixture-only',now(),NULL);`);
  });
  it('applies recorded operations and every pre/postcheck without modifying existing rows', async () => {
    const before = (await db.query('SELECT * FROM workers ORDER BY id')).rows;
    const companies = (await db.query('SELECT * FROM companies ORDER BY id'))
      .rows;
    expect(
      foundationOps.every(
        (operation) => operation.operationClass === 'additive',
      ),
    ).toBe(true);
    expect(vehicleOps.map((operation) => operation.operationClass)).toEqual([
      'additive',
      'additive',
      'additive',
    ]);
    await db.transaction(async (tx) => {
      await apply(foundationOps, tx);
      await apply(vehicleOps, tx);
    });
    expect((await db.query('SELECT * FROM workers ORDER BY id')).rows).toEqual(
      before,
    );
    expect(
      (await db.query('SELECT * FROM companies ORDER BY id')).rows,
    ).toEqual(companies);
    expect(
      (await db.query('SELECT manufacturer,model FROM vehicles')).rows,
    ).toEqual([
      { manufacturer: null, model: null },
      { manufacturer: null, model: null },
    ]);
    expect((await db.query('SELECT * FROM company_memberships')).rows).toEqual(
      [],
    );
    expect(
      (await db.query('SELECT * FROM platform_admin_grants')).rows,
    ).toEqual([]);
    const names = (
      await db.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
      )
    ).rows.map((row) => row.table_name);
    expect(names).toEqual(
      Object.keys(contract.storage.namespaces.public.entries.table).sort(),
    );
    await expect(
      db.exec(
        `INSERT INTO vehicles(id,"companyId",type,"plateNumber","updatedAt") VALUES ('duplicate','company-a','CAR','DEMO-A',now())`,
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await db.exec(
      `INSERT INTO vehicles(id,"companyId",type,"plateNumber","updatedAt") VALUES ('other-company','company-b','CAR','DEMO-A',now())`,
    );
    await expect(
      db.exec(`UPDATE workers SET "vehicleId"='vehicle-a' WHERE id='driver-b'`),
    ).rejects.toMatchObject({ code: '23505' });
  });
  it('rolls back the foundation DDL too if vehicle uniqueness fails in the same transaction', async () => {
    await db.exec(
      `INSERT INTO vehicles(id,"companyId",type,"plateNumber","updatedAt") VALUES ('duplicate','company-a','CAR','DEMO-A',now())`,
    );
    await expect(
      db.transaction(async (tx) => {
        await apply(foundationOps, tx);
        await apply(vehicleOps, tx);
      }),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          "SELECT to_regclass('public.company_memberships') AS table_name",
        )
      ).rows,
    ).toEqual([{ table_name: null }]);
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS total FROM information_schema.columns WHERE table_name='vehicles' AND column_name='manufacturer'",
        )
      ).rows,
    ).toEqual([{ total: 0 }]);
  });
  it('executes preflight read-only on the original baseline and postflight on the destination', async () => {
    const preflight = await db.exec(await sql('preflight.sql'));
    expect(
      preflight.some((result) =>
        result.rows.some((row) => row.transaction_read_only === 'on'),
      ),
    ).toBe(true);
    await apply(foundationOps);
    await apply(vehicleOps);
    // Fixture marker only, not Prisma runner verification or ledger integration.
    await db.query(
      'UPDATE prisma_contract.marker SET core_hash=$1,profile_hash=$2',
      [contract.storage.storageHash, contract.profileHash],
    );
    const postflight = await db.exec(await sql('postflight.sql'));
    expect(postflight[2].rows[0]).toMatchObject({
      matches_reviewed_destination: true,
    });
    const columns = (
      await db.query(
        "SELECT column_name,is_nullable FROM information_schema.columns WHERE table_name='vehicles' AND column_name IN ('manufacturer','model') ORDER BY column_name",
      )
    ).rows;
    expect(columns).toEqual([
      { column_name: 'manufacturer', is_nullable: 'YES' },
      { column_name: 'model', is_nullable: 'YES' },
    ]);
  });
  it('read-only transaction refuses accidental writes even in the privileged disposable fixture', async () => {
    await expect(
      db.exec("BEGIN READ ONLY; UPDATE companies SET name='must not persist';"),
    ).rejects.toMatchObject({ code: '25006' });
    await db.exec('ROLLBACK');
    expect(
      (await db.query("SELECT name FROM companies WHERE id='company-a'")).rows,
    ).toEqual([{ name: 'Fictional A' }]);
  });
  it.each(['workers_vehicleId_key', 'workers_vehicleId_fkey'])(
    'review guard refuses a missing assignment constraint: %s',
    async (constraint) => {
      await apply(foundationOps);
      // Only fixed test-case constraint names are interpolated here.
      await db.exec(`ALTER TABLE workers DROP CONSTRAINT "${constraint}"`);
      await expect(db.exec(await sql('additive.review.sql'))).rejects.toThrow(
        'Vehicle migration blocked: required',
      );
      await db.exec('ROLLBACK');
    },
  );
  it('detects normalized duplicate plates without silently repairing stored records', async () => {
    await apply(foundationOps);
    await db.exec(
      `INSERT INTO vehicles(id,"companyId",type,"plateNumber","updatedAt") VALUES ('duplicate','company-a','CAR',' demo-a ',now())`,
    );
    const results = await db.exec(await sql('preflight.sql'));
    expect(
      results.some((result) =>
        result.rows.some(
          (row) =>
            row.duplicate_normalized_plate_groups === 1 ||
            row.duplicate_normalized_plate_groups === '1',
        ),
      ),
    ).toBe(true);
    await expect(db.exec(await sql('additive.review.sql'))).rejects.toThrow(
      'duplicate company plates',
    );
    await db.exec('ROLLBACK');
    expect(
      (
        await db.query(
          'SELECT "plateNumber" FROM vehicles WHERE id=\'duplicate\'',
        )
      ).rows,
    ).toEqual([{ plateNumber: ' demo-a ' }]);
  });
});
