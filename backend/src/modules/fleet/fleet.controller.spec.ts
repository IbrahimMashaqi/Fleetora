import { describe, expect, it, vi } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { HeadquartersInput } from './fleet.dto.js';
import { companyAdmin } from './fleet.repository.js';
import { UnconfiguredDriverIdentityVerifier } from './driver-telemetry.service.js';
import { HeadquartersController } from './fleet.controller.js';
import type { FleetRepository } from './fleet.repository.js';
import type { FleetEvents } from './fleet-events.js';
describe('headquarters input and company authorization', () => {
  it.each([
    { latitude: 91 },
    { longitude: -181 },
    { latitude: '31' },
    { latitude: NaN },
    { longitude: Infinity },
    { latitude: 31.12345678 },
    { expectedRevision: -1 },
    { expectedRevision: 0.5 },
    { address: 'a'.repeat(301) },
  ])('rejects invalid fields %j', async (fields) => {
    expect(
      await validate(
        plainToInstance(HeadquartersInput, {
          latitude: 31.9,
          longitude: 35.2,
          expectedRevision: 0,
          ...fields,
        }),
      ),
    ).not.toHaveLength(0);
  });
  it('accepts valid boundaries, optional address and explicit seven-decimal precision', async () => {
    expect(
      await validate(
        plainToInstance(HeadquartersInput, {
          latitude: -90,
          longitude: 180,
          expectedRevision: 0,
        }),
      ),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(HeadquartersInput, {
          latitude: 31.1234567,
          longitude: 35.2,
          address: null,
          expectedRevision: 1,
        }),
      ),
    ).toEqual([]);
  });
  it('rejects anonymous, platform, other roles and missing company', () => {
    expect(() => companyAdmin(undefined)).toThrow();
    for (const role of ['PLATFORM_ADMIN', 'MERCHANT', 'ACCOUNTANT'] as const)
      expect(() =>
        companyAdmin({ sub: 'user', role, orgId: 'company', email: '' }),
      ).toThrow();
    expect(() =>
      companyAdmin({
        sub: 'user',
        role: 'COMPANY_ADMIN',
        orgId: '',
        email: '',
      }),
    ).toThrow();
  });
  it('fences stale UI context before any HQ write', async () => {
    const saveHeadquarters = vi.fn();
    const publish = vi.fn();
    const controller = new HeadquartersController(
      { saveHeadquarters } as unknown as FleetRepository,
      { publish } as unknown as FleetEvents,
    );
    await expect(
      controller.save(
        { sub: 'user', role: 'COMPANY_ADMIN', orgId: 'company', email: '' },
        { latitude: 31, longitude: 35, expectedRevision: 0 },
        'other',
      ),
    ).rejects.toThrow();
    expect(saveHeadquarters).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
  it('default driver identity verifier rejects an admin pretending to be a driver', async () => {
    await expect(
      new UnconfiguredDriverIdentityVerifier().verify(),
    ).rejects.toMatchObject({ status: 401 });
  });
});
