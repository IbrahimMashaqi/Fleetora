import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { flutterExecutable } from './flutter-toolchain.js';

const checks = [
  'arabic_rtl',
  'english_ltr',
  'login',
  'secure_storage',
  'session_restore',
  'expired_access_refresh',
  'inclusive_pricing',
  'cod_parcel',
  'parcel_list',
  'zero_cod',
  'qr_label',
  'pdf_raster',
  'map_pin',
  'map_native_tap',
  'map_arabic_rtl',
  'map_cancel_preserves_pin',
  'map_reopen',
  'warehouse_pickup',
  'logout',
  'logout_storage',
  'expired_refresh_signout',
] as const;

/** Opt-in device test: its caller must first verify the owned PostgreSQL guard. */
export async function verifyMerchantAndroid(input: {
  backendPort: number;
  merchantEmail: string;
  password: string;
  zoneLabel: string;
  expiredAccessToken: string;
  expiredRefreshToken: string;
  workbookBase64?: string;
}) {
  const device = process.env.FLEETORA_ANDROID_DEVICE;
  if (!device || !/^emulator-\d+$/.test(device))
    throw new Error('The explicitly owned Android QA emulator is required');
  const root = path.resolve(import.meta.dirname, '../..');
  const sdk = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME;
  if (!sdk) throw new Error('Android SDK location is required');
  const adb = path.join(sdk, 'platform-tools', 'adb.exe');
  const identity = spawnSync(adb, ['-s', device, 'emu', 'avd', 'name'], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 15000,
  });
  // Windows adb can emit CR CR LF, not only CR LF.
  const identityLines = identity.stdout
    ?.split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    identity.status !== 0 ||
    identityLines?.[0] !== 'FleetoraMerchantQA_API35' ||
    identityLines.at(-1) !== 'OK'
  )
    throw new Error('Android device identity does not match the owned QA AVD');
  const boot = spawnSync(
    adb,
    ['-s', device, 'shell', 'getprop', 'sys.boot_completed'],
    {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 15000,
    },
  );
  const anr = spawnSync(
    adb,
    ['-s', device, 'shell', 'dumpsys', 'activity', 'lastanr'],
    {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 15000,
    },
  );
  if (
    boot.status !== 0 ||
    boot.stdout.trim() !== '1' ||
    anr.status !== 0 ||
    !anr.stdout.includes('<no ANR has occurred since boot>')
  )
    throw new Error(
      'Android QA environment is unhealthy: require a fully booted device without an ANR since boot',
    );
  const flutter = flutterExecutable();
  const output = mkdtempSync(path.join(tmpdir(), 'fleetora-merchant-android-'));
  const privateDirectory = path.join(output, 'private');
  mkdirSync(privateDirectory);
  const defines = path.join(privateDirectory, 'test-defines.json');
  writeFileSync(
    defines,
    JSON.stringify({
      API_BASE_URL: `http://127.0.0.1:${input.backendPort}`,
      NATIVE_TEST_EMAIL: input.merchantEmail,
      NATIVE_TEST_PASSWORD: input.password,
      NATIVE_TEST_ZONE: input.zoneLabel,
      NATIVE_TEST_EXPIRED_ACCESS: input.expiredAccessToken,
      NATIVE_TEST_EXPIRED_REFRESH: input.expiredRefreshToken,
      NATIVE_TEST_PICKER: input.workbookBase64 ? 'true' : 'false',
      NATIVE_TEST_SYSTEM_SHEETS: device.startsWith('emulator-')
        ? 'true'
        : 'false',
    }),
  );
  const reverse = spawnSync(
    adb,
    [
      '-s',
      device,
      'reverse',
      `tcp:${input.backendPort}`,
      `tcp:${input.backendPort}`,
    ],
    { windowsHide: true, encoding: 'utf8', timeout: 15000 },
  );
  if (reverse.status !== 0) {
    rmSync(defines, { force: true });
    throw new Error('Android loopback forwarding failed');
  }
  let log = '';
  const screenshots: {
    label: string;
    filename: string;
    captured: boolean;
    nativeSheetConfirmed?: boolean;
    cancelled?: boolean;
  }[] = [];
  let screenshotQueue = Promise.resolve();
  let captureError: string | undefined;
  let mapCaptureCount = 0;
  const capture = async (label: string) => {
    const suffix = label === 'MAP_REVIEW' ? `-${++mapCaptureCount}` : '';
    const filename = `android-${label.toLowerCase().replaceAll('_', '-')}${suffix}.png`;
    const remote = `/sdcard/fleetora-qa-${randomUUID()}.png`;
    const execute = (args: string[]) =>
      new Promise<boolean>((resolve) => {
        const command = spawn(adb, ['-s', device, ...args], {
          windowsHide: true,
          stdio: 'ignore',
        });
        const timer = setTimeout(() => {
          command.kill();
          resolve(false);
        }, 15000);
        command.once('error', () => {
          clearTimeout(timer);
          resolve(false);
        });
        command.once('close', (code) => {
          clearTimeout(timer);
          resolve(code === 0);
        });
      });
    let captured = false;
    let nativeSheetConfirmed: boolean | undefined;
    let cancelled: boolean | undefined;
    try {
      if (label === 'MAP_REVIEW') {
        // A map style loading is asynchronous. The first frame is not evidence
        // that tiles failed; capture after real network/render time.
        await new Promise((resolve) => setTimeout(resolve, 6000));
        const focus = spawnSync(
          adb,
          ['-s', device, 'shell', 'dumpsys', 'window'],
          {
            windowsHide: true,
            encoding: 'utf8',
            timeout: 5000,
          },
        );
        // A System UI ANR dialog consumed the old test's touch. Do not classify
        // a touch sent to another window as a failed MapLibre application event.
        if (
          focus.status !== 0 ||
          !/mCurrentFocus=[^\r\n]*com\.fleetora\.merchant\//.test(focus.stdout)
        )
          throw new Error(
            'Android map touch blocked: Fleetora does not own the focused window',
          );
        const point = [...log.matchAll(/NATIVE_MAP_TAP x=(\d+) y=(\d+)/g)].at(
          -1,
        );
        if (
          !point ||
          point.slice(1).some((v) => Number(v) <= 0 || Number(v) > 4096)
        )
          throw new Error('Owned native map touch coordinates are invalid');
        if (!(await execute(['shell', 'input', 'tap', point[1]!, point[2]!])))
          throw new Error('Owned native map touch failed');
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (label === 'PRINT_SHEET' || label === 'SHARE_SHEET') {
        const deadline = Date.now() + 30000;
        do {
          const activity = await new Promise<string>((resolve) => {
            const command = spawn(
              adb,
              ['-s', device, 'shell', 'dumpsys', 'activity', 'activities'],
              { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
            );
            let result = '';
            command.stdout.on('data', (chunk: Buffer) => {
              result += chunk.toString();
            });
            const timer = setTimeout(() => {
              command.kill();
              resolve('');
            }, 5000);
            command.once('error', () => {
              clearTimeout(timer);
              resolve('');
            });
            command.once('close', () => {
              clearTimeout(timer);
              resolve(result);
            });
          });
          const resumed = activity
            .split('\n')
            .filter((line) => /mResumedActivity|topResumedActivity/.test(line))
            .join(' ');
          nativeSheetConfirmed =
            label === 'PRINT_SHEET'
              ? /com\.android\.printspooler\/[\w.$]+/.test(resumed)
              : /(?:android|com\.android\.intentresolver|com\.google\.android\.intentresolver)\/[\w.$]*(?:ChooserActivity|ResolverActivity)/.test(
                  resumed,
                );
          if (!nativeSheetConfirmed)
            await new Promise((resolve) => setTimeout(resolve, 250));
        } while (!nativeSheetConfirmed && Date.now() < deadline);
      }
      if (await execute(['shell', 'screencap', '-p', remote]))
        captured = await execute(['pull', remote, path.join(output, filename)]);
      if (nativeSheetConfirmed && device.startsWith('emulator-'))
        cancelled = await execute([
          'shell',
          'input',
          'keyevent',
          'KEYCODE_BACK',
        ]);
    } finally {
      await execute(['shell', 'rm', remote]);
    }
    screenshots.push({
      label,
      filename,
      captured,
      nativeSheetConfirmed,
      cancelled,
    });
  };
  let workbookPrepared = false;
  const startedAt = new Date().toISOString();
  try {
    if (input.workbookBase64) {
      if (!device.startsWith('emulator-')) {
        rmSync(defines, { force: true });
        throw new Error('The owned DocumentsUI fixture requires an emulator');
      }
      const exists = spawnSync(
        adb,
        [
          '-s',
          device,
          'shell',
          'test',
          '-e',
          '/sdcard/Download/fleetora-native.xlsx',
        ],
        { windowsHide: true, stdio: 'ignore', timeout: 15000 },
      );
      if (exists.status !== 1) {
        rmSync(defines, { force: true });
        throw new Error(
          'Device workbook path is occupied or cannot be checked',
        );
      }
      const workbook = path.join(output, 'fleetora-native.xlsx');
      writeFileSync(workbook, Buffer.from(input.workbookBase64, 'base64'));
      const push = spawnSync(
        adb,
        [
          '-s',
          device,
          'push',
          workbook,
          '/sdcard/Download/fleetora-native.xlsx',
        ],
        { windowsHide: true, stdio: 'ignore', timeout: 15000 },
      );
      if (push.status !== 0) {
        rmSync(defines, { force: true });
        throw new Error('Could not prepare owned device workbook');
      }
      workbookPrepared = true;
    }
    // Async spawn is essential: the same process serves the real Nest HTTP API.
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(
        `"${flutter}"`,
        [
          'test',
          'integration_test/merchant_android_test.dart',
          '-d',
          device,
          `--dart-define-from-file="${defines}"`,
          '--timeout=12m',
        ],
        {
          cwd: path.join(root, 'apps/merchant_app'),
          shell: true,
          windowsHide: true,
          // Generated Windows Gradle wrappers echo commands when DEBUG is set.
          // Dart defines contain disposable fixture credentials and tokens.
          env: { ...process.env, DEBUG: '' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      const timer = setTimeout(
        () => {
          child.kill();
          reject(
            new Error('Native Flutter test exceeded its execution deadline'),
          );
        },
        20 * 60 * 1000,
      );
      let printed = 0;
      child.stdout.on('data', (chunk: Buffer) => {
        log += chunk.toString();
        const markers =
          log.match(
            /NATIVE_(?:CHECK [a-z_]+=PASS|WAIT (?:FILE_PICKER|MAP_REVIEW|AR_MAIN|EN_MAIN|PRINT_SHEET|SHARE_SHEET))/g,
          ) ?? [];
        for (const marker of markers.slice(printed)) {
          console.log(marker);
          // Vitest buffers console output; expose allowlisted live milestones.
          writeFileSync(
            path.join(output, 'progress.json'),
            JSON.stringify({ marker, at: new Date().toISOString() }),
          );
          const label = marker.slice('NATIVE_WAIT '.length);
          if (
            [
              'MAP_REVIEW',
              'AR_MAIN',
              'EN_MAIN',
              'PRINT_SHEET',
              'SHARE_SHEET',
            ].includes(label)
          )
            screenshotQueue = screenshotQueue
              .then(() => capture(label))
              .catch((error) => {
                captureError =
                  error instanceof Error
                    ? error.message
                    : 'Android capture failed';
              });
        }
        printed = markers.length;
      });
      child.stderr.on('data', (chunk: Buffer) => {
        log += chunk.toString();
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        resolve(code ?? -1);
      });
    });
    await screenshotQueue;
    const capabilityMatch = log.match(
      /NATIVE_CAPABILITY canPrint=(true|false) canShare=(true|false)/,
    );
    const printingCapabilities = {
      canPrint: capabilityMatch?.[1] === 'true',
      canShare: capabilityMatch?.[2] === 'true',
    };
    const expected: readonly string[] = [
      ...checks,
      ...(input.workbookBase64 ? ['excel_picker_upload'] : []),
      ...(device.startsWith('emulator-') && printingCapabilities.canPrint
        ? ['print_sheet_cancelled']
        : []),
      ...(device.startsWith('emulator-') && printingCapabilities.canShare
        ? ['share_sheet_cancelled']
        : []),
    ];
    const passed = expected.filter((check) =>
      log.includes(`NATIVE_CHECK ${check}=PASS`),
    );
    const missing = expected.filter((check) => !passed.includes(check));
    const selection = log.match(
      /NATIVE_MAP_SELECTED latitude=([-\d.e+]+) longitude=([-\d.e+]+)/,
    );
    const latitude = Number(selection?.[1]),
      longitude = Number(selection?.[2]);
    const selectedLocation =
      Number.isFinite(latitude) &&
      Math.abs(latitude) <= 90 &&
      Number.isFinite(longitude) &&
      Math.abs(longitude) <= 180
        ? { latitude, longitude }
        : undefined;
    const sheetEvidenceValid = ['PRINT_SHEET', 'SHARE_SHEET'].every((label) => {
      const required =
        device.startsWith('emulator-') &&
        (label === 'PRINT_SHEET'
          ? printingCapabilities.canPrint
          : printingCapabilities.canShare);
      return (
        !required ||
        screenshots.some(
          (shot) =>
            shot.label === label &&
            shot.captured &&
            shot.nativeSheetConfirmed &&
            shot.cancelled,
        )
      );
    });
    // Test log contains fixture identities only. Never persist the secret value.
    writeFileSync(
      path.join(output, 'flutter-native.log'),
      log
        .replace(/-Pdart-defines=[^\s]+/g, '-Pdart-defines=[REDACTED]')
        .replaceAll(input.password, '[REDACTED]')
        .replaceAll(input.merchantEmail, '[FIXTURE_IDENTITY]')
        .replaceAll(input.expiredAccessToken, '[REDACTED]')
        .replaceAll(input.expiredRefreshToken, '[REDACTED]'),
    );
    writeFileSync(
      path.join(output, 'result.json'),
      JSON.stringify(
        {
          startedAt,
          completedAt: new Date().toISOString(),
          device,
          exitCode,
          actualBackend: true,
          actualPostgreSQL: true,
          passed,
          missing,
          screenshots,
          printingCapabilities,
          selectedLocation,
          captureError,
          sheetEvidenceValid,
          success:
            exitCode === 0 &&
            missing.length === 0 &&
            sheetEvidenceValid &&
            !!selectedLocation &&
            !captureError,
          notVerified: [
            'OS process-death restoration',
            ...(!input.workbookBase64 ? ['Excel OS file picker/upload'] : []),
            'physical printer',
            'camera',
            ...(!screenshots.some(
              (shot) =>
                shot.label === 'SHARE_SHEET' &&
                shot.nativeSheetConfirmed &&
                shot.cancelled,
            )
              ? ['native OS share sheet']
              : []),
            'map tile rendering visual inspection',
          ],
        },
        null,
        2,
      ),
    );
    if (
      exitCode !== 0 ||
      missing.length ||
      !sheetEvidenceValid ||
      !selectedLocation ||
      captureError
    )
      throw new Error(`Native Android QA failed; inspect ${output}`);
    return { output, selectedLocation };
  } finally {
    rmSync(defines, { force: true });
    if (workbookPrepared)
      spawnSync(
        adb,
        ['-s', device, 'shell', 'rm', '/sdcard/Download/fleetora-native.xlsx'],
        { windowsHide: true, stdio: 'ignore', timeout: 15000 },
      );
    spawnSync(
      adb,
      ['-s', device, 'reverse', '--remove', `tcp:${input.backendPort}`],
      { windowsHide: true, stdio: 'ignore', timeout: 15000 },
    );
  }
}
