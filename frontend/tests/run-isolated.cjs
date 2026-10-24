const fs = process.getBuiltinModule('node:fs');
const path = process.getBuiltinModule('node:path');
const os = process.getBuiltinModule('node:os');
const cp = process.getBuiltinModule('node:child_process');
const net = process.getBuiltinModule('node:net');

const frontend = path.resolve(__dirname, '..');
const arguments_ = process.argv.slice(2);
const outputIndex = arguments_.indexOf('--output');
const target = outputIndex < 0 ? fs.mkdtempSync(path.join(os.tmpdir(), 'fleetora-frontend-')) : path.resolve(arguments_[outputIndex + 1]);
if (outputIndex >= 0) {
  if (fs.existsSync(target)) throw new Error('The isolated output directory must be new');
  arguments_.splice(outputIndex, 2);
  fs.mkdirSync(target, { recursive: true });
}
for (const entry of fs.readdirSync(frontend, { withFileTypes: true })) {
  if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name.startsWith('test-results') || entry.name === 'playwright-report' || entry.name.endsWith('.tsbuildinfo')) continue;
  fs.cpSync(path.join(frontend, entry.name), path.join(target, entry.name), { recursive: true, errorOnExist: true });
}
fs.symlinkSync(path.join(frontend, 'node_modules'), path.join(target, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
for (const [route, fixture] of [['app/app/test-child', 'protected-child'], ['app/test-ui', 'primitive-probe'], ['app/test-vehicle-brand', 'vehicle-brand-probe']]) {
  fs.mkdirSync(path.join(target, route), { recursive: true });
  fs.writeFileSync(path.join(target, route, 'page.tsx'), `export { default } from "@/tests/fixtures/${fixture}";\n`, { flag: 'wx' });
}
fs.writeFileSync(path.join(target, 'isolated.config.ts'), `import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({ ...base, webServer: undefined, outputDir: "./isolated-results",
  reporter: [["line"], ["json", { outputFile: "./isolated-report.json" }]],
  projects: [...(base.projects ?? []), { name: "harness", testDir: "./tests/harness", testMatch: "**/*.browser.spec.ts", use: base.projects?.find(project => project.name === "browser")?.use }],
});\n`, { flag: 'wx' });

const environment = { ...process.env, FLEETORA_API_URL: 'http://127.0.0.1:3101', NODE_ENV: 'development' };
let server;
async function run() {
  await new Promise((resolve, reject) => {
    const reservation = net.createServer();
    reservation.once('error', reject);
    reservation.listen(3100, 'localhost', () => reservation.close(resolve));
  });
  const descriptor = fs.openSync(path.join(target, 'isolated-server.log'), 'wx');
  server = cp.fork(path.join(target, 'tests/isolated-server.cjs'), [], { cwd: target, env: environment, windowsHide: true, stdio: ['ignore', descriptor, descriptor, 'ipc'] });
  fs.closeSync(descriptor);
  fs.writeFileSync(path.join(target, 'isolated-server.json'), JSON.stringify({ pid: server.pid, parentPid: process.pid, cwd: target }, null, 2), { flag: 'wx' });
  console.log('Isolated frontend: ' + target);
  await new Promise((resolve, reject) => {
    // Cold compilation now includes both Fleet and parcel workspaces. This is a
    // process-readiness budget; individual Playwright test limits stay unchanged.
    const timeout = setTimeout(() => reject(new Error('Isolated server startup timed out')), 240000);
    server.once('message', message => {
      clearTimeout(timeout);
      if (message === 'ready') resolve();
      else reject(new Error('Unexpected startup response'));
    });
    server.once('exit', () => { clearTimeout(timeout); reject(new Error('Isolated server exited before readiness')); });
  });
  const args = ['node_modules/playwright/cli.js', 'test', ...arguments_, '--config=isolated.config.ts'];
  const result = cp.spawnSync(process.execPath, args, { cwd: target, env: environment, windowsHide: true, encoding: 'utf8', timeout: 1800000, maxBuffer: 32 * 1024 * 1024 });
  fs.writeFileSync(path.join(target, 'isolated-tests.log'), (result.stdout ?? '') + (result.stderr ?? ''), { flag: 'wx' });
  fs.writeFileSync(path.join(target, 'isolated-command.json'), JSON.stringify({ executable: process.execPath, args, exitCode: result.status, error: result.error?.message }, null, 2), { flag: 'wx' });
  console.log(((result.stdout ?? '') + (result.stderr ?? '')).slice(-18000));
  process.exitCode = result.status ?? 1;
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (server && server.exitCode === null) {
    await new Promise(resolve => {
      server.once('exit', resolve);
      server.send('stop');
    });
    console.log('Owned isolated server stopped. Output retained.');
  }
});
