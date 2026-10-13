// Test-only Next server. No production startup scripts or routes use this file.
const http = process.getBuiltinModule('node:http');

process.on('message', message => {
  if (message === 'stop') process.exit(0); // Terminates only this owned test process.
});
import('next').then(async ({ default: next }) => {
  const app = next({ dev: true, dir: process.cwd(), hostname: 'localhost', port: 3100, webpack: true });
  await app.prepare();
  const handler = app.getRequestHandler();
  const server = http.createServer((request, response) => handler(request, response));
  server.on('upgrade', app.getUpgradeHandler());
  server.listen(3100, 'localhost', () => process.send?.('ready'));
}).catch(() => {
  console.error('Isolated Next test server failed to start; inspect the owned server log.');
  process.exit(1);
});
