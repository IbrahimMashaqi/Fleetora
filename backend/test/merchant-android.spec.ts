import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawnSync: vi.fn(), flutter: vi.fn() }));
vi.mock('node:child_process', () => ({
  spawnSync: mocks.spawnSync,
  spawn: vi.fn(),
}));
vi.mock('./flutter-toolchain.js', () => ({ flutterExecutable: mocks.flutter }));

import { verifyMerchantAndroid } from './merchant-android.js';

const fixture = {
  backendPort: 12345,
  merchantEmail: 'fixture@example.invalid',
  password: 'disposable-test-password',
  zoneLabel: 'Fixture zone',
  expiredAccessToken: 'fixture-access',
  expiredRefreshToken: 'fixture-refresh',
};
const command = (stdout: string, status = 0) => ({ stdout, status });

describe('native QA device health gate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('FLEETORA_ANDROID_DEVICE', 'emulator-5554');
    vi.stubEnv('ANDROID_SDK_ROOT', 'C:/fixture-android-sdk');
    mocks.spawnSync.mockReturnValueOnce(
      command('FleetoraMerchantQA_API35\r\r\nOK\r\n'),
    );
    mocks.flutter.mockImplementation(() => {
      throw new Error('Healthy device reached Flutter boundary');
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('refuses an unowned device before invoking adb', async () => {
    vi.stubEnv('FLEETORA_ANDROID_DEVICE', 'physical-device');
    await expect(verifyMerchantAndroid(fixture)).rejects.toThrow(
      'explicitly owned',
    );
    expect(mocks.spawnSync).not.toHaveBeenCalled();
  });

  it.each([
    [
      'incomplete boot',
      command('0'),
      command('<no ANR has occurred since boot>'),
    ],
    [
      'failed boot query',
      command('1', 1),
      command('<no ANR has occurred since boot>'),
    ],
    [
      'System UI startup ANR',
      command('1'),
      command('ANR in com.android.systemui: failed to complete startup'),
    ],
    ['unavailable ANR metadata', command('1'), command('', 1)],
  ])(
    'rejects %s without building, installing, or sending touches',
    async (_name, boot, anr) => {
      mocks.spawnSync.mockReturnValueOnce(boot).mockReturnValueOnce(anr);
      await expect(verifyMerchantAndroid(fixture)).rejects.toThrow(
        'environment is unhealthy',
      );
      expect(mocks.flutter).not.toHaveBeenCalled();
      expect(mocks.spawnSync).toHaveBeenCalledTimes(3);
    },
  );

  it('allows a fully booted, ANR-free device to reach the Flutter boundary', async () => {
    mocks.spawnSync
      .mockReturnValueOnce(command('1\r\n'))
      .mockReturnValueOnce(
        command('ACTIVITY MANAGER LAST ANR\n<no ANR has occurred since boot>'),
      );
    await expect(verifyMerchantAndroid(fixture)).rejects.toThrow(
      'Healthy device reached Flutter boundary',
    );
    expect(mocks.flutter).toHaveBeenCalledOnce();
  });
});
