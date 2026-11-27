import { describe, expect, it } from 'vitest';
import {
  platformPermissions,
  platformRole,
  bootstrapEmail,
} from './platform-policy.js';

describe('OD-15 platform identity policy', () => {
  it.each(['SUPER_ADMIN', 'COMPANY_MANAGER', 'BILLING', 'SUPPORT'])(
    'recognizes the built-in %s role without company authority',
    (role) => {
      expect(platformRole(role)).toBe(true);
      expect(platformPermissions(role)).toMatchObject({
        companyOperations: false,
        supportAccess: false,
      });
    },
  );
  it('separates team, company and billing authority; support is read-only', () => {
    expect(platformPermissions('SUPER_ADMIN')).toMatchObject({
      manageTeam: true,
      manageCompanies: true,
      managePlans: true,
    });
    expect(platformPermissions('COMPANY_MANAGER')).toMatchObject({
      manageTeam: false,
      manageCompanies: true,
      manageBilling: false,
    });
    expect(platformPermissions('BILLING')).toMatchObject({
      manageTeam: false,
      manageCompanies: false,
      manageBilling: true,
      managePlans: false,
    });
    expect(platformPermissions('SUPPORT')).toMatchObject({
      manageTeam: false,
      manageCompanies: false,
      manageBilling: false,
    });
    expect(() => platformPermissions('COMPANY_ADMIN')).toThrow();
  });
  it('requires and normalizes a bootstrap email without accepting password arguments', () => {
    expect(bootstrapEmail(['--email', 'Owner@Example.invalid'], {})).toBe(
      'owner@example.invalid',
    );
    expect(
      bootstrapEmail([], {
        FLEETORA_PLATFORM_BOOTSTRAP_EMAIL: 'owner@example.invalid',
      }),
    ).toBe('owner@example.invalid');
    expect(() => bootstrapEmail([], {})).toThrow();
    expect(() => bootstrapEmail(['--password', 'secret'], {})).toThrow();
  });
});
