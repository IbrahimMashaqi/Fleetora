// An owned loopback-only PostgreSQL cluster. Never reads the application's env.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const net = require('node:net');
const pg = require('pg');
const root = path.resolve(__dirname, '..');
const tools = process.env.FLEETORA_PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/lib/postgresql/18/bin');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetora-parcel-postgres-'));
const directory = path.join(output, 'cluster');
const role = 'fleetora_parcel_test', database = 'fleetora_parcel_test';
let started = false;
const environment = { ...process.env };
for (const key of Object.keys(environment)) if (key.startsWith('PG') || /DATABASE_URL/.test(key)) delete environment[key];
function run(command, args, name, env = environment) {
  // pg_ctl's server descendants can retain pipe handles after pg_ctl exits.
  // File descriptors prevent spawnSync waiting for their pipe EOF forever.
  const descriptor = fs.openSync(path.join(output, `${name}.log`), 'w');
  let result;
  try { result = cp.spawnSync(command, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', descriptor, descriptor], timeout: name === 'start-owned-cluster' ? 60000 : 900000 }); }
  finally { fs.closeSync(descriptor); }
  if (result.status !== 0) throw new Error(`${name} failed; diagnostic log is in the owned test output directory`);
  return result;
}
async function main() {
  for (const binary of ['initdb', 'pg_ctl']) if (!fs.existsSync(path.join(tools, binary + (process.platform === 'win32' ? '.exe' : '')))) throw new Error('PostgreSQL 18 tools are required; configure FLEETORA_PG_BIN');
  const port = await new Promise((resolve, reject) => { const reservation = net.createServer(); reservation.once('error', reject); reservation.listen(0, '127.0.0.1', () => { const address = reservation.address(); reservation.close(() => resolve(address.port)); }); });
  run(path.join(tools, 'initdb'), ['-D', directory, '-U', role, '--auth-local=trust', '--auth-host=trust', '-E', 'UTF8', '--no-locale'], 'initialize-owned-cluster');
  started = true;
  run(path.join(tools, 'pg_ctl'), ['-D', directory, '-l', path.join(output, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], 'start-owned-cluster');
  const client = new pg.Client({ host: '127.0.0.1', port, user: role, database: 'postgres' });
  await client.connect();
  try { await client.query(`CREATE DATABASE ${database}`); } finally { await client.end(); }
  const url = `postgresql://${role}@127.0.0.1:${port}/${database}`;
  Object.assign(environment, { DATABASE_URL: url, FLEETORA_TEST_DATABASE_URL: url, FLEETORA_TEST_DATABASE_NAME: database, FLEETORA_ALLOW_DESTRUCTIVE_AUTH_TESTS: 'true' });
  const prisma = path.join(root, 'node_modules/prisma/dist/prisma.js');
  const config = 'test/prisma.disposable.config.ts';
  const baseline = '9a81be706b19e625d323a75966347489edab4d41d74b73b445d7392c5989323c';
  run(process.execPath, [prisma, 'db', 'migrate', '--config', config, '--to', baseline, '--yes', '--json'], 'baseline-migrations');
  run(process.execPath, [prisma, 'db', 'migrate', '--config', config, '--show', '--json'], 'parcel-migration-preview');
  run(process.execPath, [prisma, 'db', 'migrate', '--config', config, '--yes', '--json'], 'parcel-migration-apply');
  run(process.execPath, [prisma, 'db', 'verify', '--config', config, '--strict', '--json'], 'strict-verification');
  run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.auth-integration.ts', ...(process.argv.slice(2).length ? process.argv.slice(2) : ['test/parcel-operations.auth-integration.spec.ts'])], 'integration-tests');
  console.log(fs.readFileSync(path.join(output, 'integration-tests.log'), 'utf8'));
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ database, role, baseline, migrationAndStrict: 'passed', tests: 'passed', completedAt: new Date().toISOString() }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => {
  if (started && fs.existsSync(path.join(directory, 'postmaster.pid'))) { try { run(path.join(tools, 'pg_ctl'), ['-D', directory, '-m', 'fast', '-w', 'stop'], 'stop-owned-cluster'); } catch { console.error('Owned test cluster could not be stopped; inspect its output directory.'); process.exitCode = 1; } }
  console.log(`Owned disposable test output: ${output}`);
});
