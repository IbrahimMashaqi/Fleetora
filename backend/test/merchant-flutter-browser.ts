import {
  expect as browserExpect,
  type Locator,
  type Page,
} from '../../frontend/node_modules/@playwright/test/index.js';
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { flutterExecutable } from './flutter-toolchain.js';

/** Compile a real Flutter web client for this test's loopback-only TLS API. */
export function buildMerchantFlutterBrowser(
  root: string,
  destination: string,
  apiUrl: string,
  output: string,
) {
  const descriptor = openSync(path.join(output, 'flutter-build.log'), 'w');
  try {
    const flutter = flutterExecutable();
    const result = spawnSync(
      `"${flutter}"`,
      [
        'build',
        'web',
        '--no-web-resources-cdn',
        '--no-wasm-dry-run',
        `--dart-define=API_BASE_URL=${apiUrl}`,
        `--output="${destination}"`,
      ],
      {
        cwd: path.join(root, 'apps/merchant_app'),
        shell: true,
        windowsHide: true,
        timeout: 300000,
        stdio: ['ignore', descriptor, descriptor],
      },
    );
    if (result.status !== 0)
      throw new Error(`Flutter browser build failed; inspect ${output}`);
  } finally {
    closeSync(descriptor);
  }
}

/** Uses Flutter's accessibility tree, with actual HTTP requests and no API mocks. */
export async function verifyMerchantFlutterUi(
  page: Page,
  input: { merchantEmail: string; password: string; zoneLabel: string },
  output: string,
) {
  page.setDefaultTimeout(30000);
  const reveal = async (control: Locator) => {
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('Flutter E2E requires an explicit viewport');
    for (let step = 0; step < 20; step++) {
      const bounds = (await control.count()) ? await control.boundingBox() : null;
      // Flutter semantics can report visibility while a lazy field is clipped
      // underneath the fixed app bar or bottom navigation. Scroll the canvas.
      if (bounds && bounds.y >= 64 && bounds.y + bounds.height <= viewport.height - 96)
        return;
      const delta = !bounds
        ? 250
        : bounds.y < 64
          ? bounds.y - 64
          : bounds.y + bounds.height - (viewport.height - 96);
      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      await page.mouse.wheel(0, delta);
      await page.waitForTimeout(100);
    }
    throw new Error('Flutter control did not become fully visible above navigation');
  };
  const enter = async (name: string, value: string) => {
    const field = page.getByRole('textbox', { name, exact: true });
    await reveal(field);
    await field.click();
    // Flutter settles pointer-driven focus and text-input channel placement
    // asynchronously; verify the real focused control before entering text.
    await page.waitForTimeout(200);
    await browserExpect(field).toBeFocused();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(value);
    await page.waitForTimeout(50);
    if ((await field.inputValue()) !== value)
      throw new Error(`Flutter input did not commit: ${name}`);
  };
  const click = async (name: string) => {
    const button = page.getByRole('button', { name, exact: true });
    await reveal(button);
    await button.click();
  };
  const enableSemantics = async () => {
    await page.waitForFunction(
      () =>
        document.querySelector('flt-semantics-placeholder') ||
        document.querySelector('flt-semantics-host')?.children.length,
    );
    await page.locator('flt-semantics-placeholder').evaluateAll((elements) => {
      for (const element of elements)
        if (element instanceof HTMLElement) element.click();
    });
  };
  try {
    await enableSemantics();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await enter('Email', input.merchantEmail);
    await enter('Password', input.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await click('Create parcel');
    await page.getByRole('textbox', { name: 'Recipient name', exact: true }).waitFor({ state: 'visible' });
    // Web preview sessions must survive navigation, but never a fresh document.
    // Return only a boolean so a regression cannot print persisted credentials.
    const persistedCredentials = await page.evaluate(() =>
      [localStorage, sessionStorage].some((storage) =>
        Object.entries(storage).some(([key, value]) =>
          /access.?token|refresh.?token|secure.?storage/i.test(key) ||
          /accessToken|refreshToken|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(value),
        ),
      ),
    );
    await browserExpect(persistedCredentials).toBe(false);
    await page.goto(new URL('/', page.url()).href);
    await enableSemantics();
    // A fresh Flutter engine has no in-memory session and must require login.
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await enter('Email', input.merchantEmail);
    await enter('Password', input.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await click('Create parcel');
    // Zone loading is asynchronous. Scrolling while its spinner is mounted
    // can move the new form past its first lazy field before it is available.
    await page
      .getByRole('textbox', { name: 'Recipient name', exact: true })
      .waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    await enter('Recipient name', 'Browser verified recipient');
    await enter('Phone', '+000000003');
    await page
      .getByRole('button', { name: 'City and delivery zone', exact: true })
      .click();
    await page
      .getByRole('menuitem', { name: input.zoneLabel, exact: true })
      .click();
    await enter('Detailed address', 'Browser verified destination');
    await enter('Final customer payment (ILS)', '150');
    await enter('Contents description', 'Browser verified parcel');
    await click('Preview contractual price');
    await browserExpect(
      page.getByText(/Expected merchant proceeds\s+135\.00 ILS/),
    ).toBeVisible();
    await browserExpect(
      page.getByText(/Contractual delivery fee\s+15\.00 ILS/),
    ).toBeVisible();
    await browserExpect(
      page.getByText(/Final customer payment\s+150\.00 ILS/),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(output, 'merchant-flutter-price-preview-en.png'),
      fullPage: true,
    });
    await click('Create parcel');
    await browserExpect(
      page.getByText('Browser verified recipient', { exact: false }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(output, 'merchant-real-en-mobile.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await browserExpect(
      page.getByText('المستلم', { exact: false }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(output, 'merchant-real-ar-mobile.png'),
      fullPage: true,
    });
  } catch (error) {
    writeFileSync(
      path.join(output, 'flutter-controls.json'),
      JSON.stringify(
        await page.locator('[role]').evaluateAll((elements) =>
          elements.map((element) => ({
            role: element.getAttribute('role'),
            label: element.getAttribute('aria-label'),
            bounds: element.getBoundingClientRect().toJSON(),
          })),
        ),
        null,
        2,
      ),
    );
    await page.screenshot({
      path: path.join(output, 'flutter-failure.png'),
      fullPage: true,
    });
    throw new Error(`Flutter UI verification failed; inspect ${output}`, {
      cause: error,
    });
  }
}
