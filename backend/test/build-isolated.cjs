const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');

// Do not replace dist while an existing local backend is serving it.
const source = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(
  path.join(os.tmpdir(), 'fleetora-backend-build-'),
);
fs.cpSync(source, output, {
  recursive: true,
  filter: (item) =>
    !path
      .relative(source, item)
      .split(path.sep)
      .some(
        (segment) =>
          ['node_modules', 'dist', '.git', 'coverage'].includes(segment) ||
          segment.startsWith('.env') ||
          segment.endsWith('.tsbuildinfo'),
      ),
});
fs.symlinkSync(
  path.join(source, 'node_modules'),
  path.join(output, 'node_modules'),
  process.platform === 'win32' ? 'junction' : 'dir',
);
const result = cp.spawnSync(
  process.execPath,
  [path.join(output, 'node_modules/@nestjs/cli/bin/nest.js'), 'build'],
  {
    cwd: output,
    env: process.env,
    windowsHide: true,
    stdio: 'inherit',
  },
);
console.log(`Isolated backend build: ${output}`);
process.exitCode = result.status ?? 1;
if (process.exitCode === 0) {
  // Vitest's module interop can hide CommonJS import failures in native Node ESM.
  // Import the compiled application graph without bootstrapping or opening a DB.
  const smoke = cp.spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "await import('temporal-polyfill/full/global'); await import('./dist/app.module.js');",
    ],
    { cwd: output, env: process.env, windowsHide: true, stdio: 'inherit' },
  );
  process.exitCode = smoke.status ?? 1;
  if (process.exitCode === 0) console.log('Native Node application import: PASS');
}
