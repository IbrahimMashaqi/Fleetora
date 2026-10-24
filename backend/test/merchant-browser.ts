import {
  chromium,
  expect as browserExpect,
} from '../../frontend/node_modules/@playwright/test/index.js';
import { createServer as httpServer, request as httpRequest } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { createServer as reserve } from 'node:net';
import { fork, spawnSync } from 'node:child_process';
import {
  closeSync,
  cpSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildMerchantFlutterBrowser,
  verifyMerchantFlutterUi,
} from './merchant-flutter-browser.js';
const root = path.resolve(import.meta.dirname, '../..');
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = reserve();
    server.once('error', reject);
    server.listen(0, 'localhost', () => {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Port unavailable');
      server.close(() => resolve(address.port));
    });
  });
}
/** Real Flutter web -> Nest API/PostgreSQL -> Next company UI. No API mocks. */
export async function verifyMerchantBrowser(input: {
  backendPort: number;
  merchantEmail: string;
  adminEmail: string;
  password: string;
  zoneLabel: string;
}) {
  const output = mkdtempSync(
    path.join(tmpdir(), 'fleetora-merchant-real-browser-'),
  );
  const key = path.join(output, 'local-test.key'),
    cert = path.join(output, 'local-test.crt');
  const generated = spawnSync(
    process.env.FLEETORA_OPENSSL_BIN ?? 'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  if (generated.status !== 0)
    throw new Error('Could not create local-only TLS test certificate');
  const proxy = httpsServer(
    { key: readFileSync(key), cert: readFileSync(cert) },
    (request, response) => {
      const upstream = httpRequest(
        {
          hostname: '127.0.0.1',
          port: input.backendPort,
          path: request.url,
          method: request.method,
          headers: request.headers,
        },
        (result) => {
          response.writeHead(result.statusCode ?? 502, result.headers);
          result.pipe(response);
        },
      );
      upstream.on('error', () => response.writeHead(502).end());
      request.pipe(upstream);
    },
  );
  const mobileRoot = path.join(output, 'flutter');
  const mobile = httpServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const file = path.resolve(
      mobileRoot,
      `.${pathname === '/' ? '/index.html' : pathname}`,
    );
    if (!file.startsWith(mobileRoot + path.sep) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader(
      'Content-Type',
      file.endsWith('.js') || file.endsWith('.mjs')
        ? 'application/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : file.endsWith('.wasm')
            ? 'application/wasm'
            : file.endsWith('.html')
              ? 'text/html'
              : 'application/octet-stream',
    );
    response.end(readFileSync(file));
  });
  await new Promise<void>((resolve) => proxy.listen(0, 'localhost', resolve));
  const tlsAddress = proxy.address();
  if (!tlsAddress || typeof tlsAddress === 'string')
    throw new Error('Owned TLS test endpoint unavailable');
  try {
    buildMerchantFlutterBrowser(
      root,
      mobileRoot,
      `https://localhost:${tlsAddress.port}`,
      output,
    );
  } catch (error) {
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    throw error;
  }
  await new Promise<void>((resolve) => mobile.listen(0, 'localhost', resolve));
  const proxyAddress = proxy.address(),
    mobileAddress = mobile.address();
  if (
    !proxyAddress ||
    typeof proxyAddress === 'string' ||
    !mobileAddress ||
    typeof mobileAddress === 'string'
  )
    throw new Error('Owned test endpoints unavailable');
  const apiUrl = `https://localhost:${proxyAddress.port}`,
    mobileUrl = `http://localhost:${mobileAddress.port}`;
  const frontend = path.join(root, 'frontend'),
    copy = path.join(output, 'frontend');
  cpSync(frontend, copy, {
    recursive: true,
    filter: (item) =>
      !path
        .relative(frontend, item)
        .split(path.sep)
        .some(
          (segment) =>
            ['node_modules', '.next', '.git', 'playwright-report'].includes(
              segment,
            ) ||
            segment.startsWith('.env') ||
            segment.startsWith('test-results') ||
            segment.endsWith('.tsbuildinfo'),
        ),
  });
  symlinkSync(
    path.join(frontend, 'node_modules'),
    path.join(copy, 'node_modules'),
    'junction',
  );
  const port = await freePort(),
    descriptor = openSync(path.join(output, 'next.log'), 'w');
  const nextEntry = path.join(copy, 'owned-next.cjs');
  writeFileSync(
    nextEntry,
    readFileSync(path.join(root, 'backend/test/merchant-browser-next.cjs')),
  );
  const next = fork(nextEntry, [], {
    cwd: copy,
    execArgv: [],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      FLEETORA_API_URL: apiUrl,
      FLEETORA_BROWSER_PORT: String(port),
      NODE_EXTRA_CA_CERTS: cert,
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', descriptor, descriptor, 'ipc'],
  });
  closeSync(descriptor);
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Owned Next E2E startup exceeded 180 seconds')),
      180000,
    );
    next.once('message', (message) => {
      clearTimeout(timer);
      if (message === 'ready') resolve();
      else reject(new Error('Unexpected Next readiness'));
    });
    next.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('Owned Next E2E server exited'));
    });
  });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    await ready;
    const mobileContext = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 390, height: 844 },
      }),
      page = await mobileContext.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(mobileUrl);
    await verifyMerchantFlutterUi(page, input, output);
    const companyContext = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      companyPage = await companyContext.newPage();
    companyPage.on('pageerror', (error) => errors.push(error.message));
    await companyPage.goto(`http://localhost:${port}/login`);
    await companyPage
      .getByLabel('Work email', { exact: true })
      .fill(input.adminEmail);
    await companyPage
      .getByLabel('Password', { exact: true })
      .fill(input.password);
    await companyPage
      .getByRole('button', { name: 'Sign in', exact: true })
      .click();
    await companyPage.waitForURL(/\/app(?:\?|$)/, { timeout: 60000 });
    await companyPage.goto(`http://localhost:${port}/app/parcels`);
    await browserExpect(
      companyPage.getByText('Browser verified recipient', { exact: true }),
    ).toBeVisible({ timeout: 60000 });
    await browserExpect(
      companyPage.getByText('150.00', { exact: false }).first(),
    ).toBeVisible();
    await companyPage.screenshot({
      path: path.join(output, 'company-real-parcels.png'),
      fullPage: true,
    });
    await companyPage.goto(`http://localhost:${port}/app/pickups`);
    await browserExpect(
      companyPage.getByText('No pickup requests on this page.', {
        exact: true,
      }),
    ).toBeVisible({ timeout: 60000 });
    await companyPage.goto(`http://localhost:${port}/app/requests`);
    await browserExpect(
      companyPage.getByText('No pending requests.', { exact: true }),
    ).toHaveCount(2, { timeout: 60000 });
    if (errors.length)
      throw new Error(
        `Real browser reported ${errors.length} JavaScript errors`,
      );
    writeFileSync(
      path.join(output, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          actualBackend: true,
          actualPostgreSQL: true,
          framework: 'flutter',
          webSessionPersistence: 'memory-only-reload-verified',
          mobileAmount: '150.00',
          contractualDeliveryFee: '15.00',
          merchantProceedsPreview: '135.00',
          companyDashboardVisible: true,
          mobileLocales: ['en', 'ar'],
          companyViewport: 1440,
          mobileViewport: 390,
          pageErrors: 0,
          completedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    return output;
  } finally {
    await browser.close();
    if (next.exitCode === null) {
      next.send('stop');
      await new Promise<void>((resolve) => next.once('exit', () => resolve()));
    }
    proxy.closeAllConnections();
    mobile.closeAllConnections();
    await Promise.all([
      new Promise<void>((resolve) => proxy.close(() => resolve())),
      new Promise<void>((resolve) => mobile.close(() => resolve())),
    ]);
  }
}
