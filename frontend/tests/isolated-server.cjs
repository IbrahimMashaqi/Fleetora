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
  server.listen(3100, 'localhost', async () => {
    try {
      // Compile workspace routes serially inside the existing startup window,
      // before browser navigation/prefetch can race cold manifest generation.
      // These GETs render public/session-loading UI and carry no credentials.
      for (const route of ['/login', '/app', '/app/account', '/app/merchants']) {
        const response = await fetch(`http://localhost:3100${route}`);
        await response.arrayBuffer();
        if (!response.ok) throw new Error('Isolated route warmup failed');
      }
      const response = await fetch('http://localhost:3100/api/auth/session', {
        method: 'POST',
        headers: { Origin: 'http://localhost:3100', 'Content-Type': 'application/json' },
        body: '{}',
      });
      await response.arrayBuffer();
      if (response.status !== 401) throw new Error('Credential-free session warmup must be unauthorized');
      process.send?.('ready');
    } catch {
      console.error('Isolated frontend route warmup failed.');
      process.exit(1);
    }
  });
}).catch(() => {
  console.error('Isolated Next test server failed to start; inspect the owned server log.');
  process.exit(1);
});
