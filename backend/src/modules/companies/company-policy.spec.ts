import { describe, expect, it } from 'vitest';
import {
  companyOperable,
  companyTransition,
  companyPermissions,
} from './company-policy.js';
describe('OD-11/16 company approval and security suspension', () => {
  it.each(['PENDING', 'REJECTED'])(
    'blocks operations for %s even without security suspension',
    (approvalStatus) => {
      expect(companyOperable({ approvalStatus, suspended: false })).toBe(false);
    },
  );
  it('requires active approval and no suspension', () => {
    expect(
      companyOperable({ approvalStatus: 'ACTIVE', suspended: false }),
    ).toBe(true);
    expect(companyOperable({ approvalStatus: 'ACTIVE', suspended: true })).toBe(
      false,
    );
  });
  it('separates approval, rejection and security suspension with required reasons', () => {
    expect(
      companyTransition(
        { approvalStatus: 'PENDING', suspended: false },
        'approve',
      ),
    ).toMatchObject({ approvalStatus: 'ACTIVE' });
    expect(
      companyTransition(
        { approvalStatus: 'PENDING', suspended: false },
        'reject',
        'Incorrect details',
      ),
    ).toMatchObject({
      approvalStatus: 'REJECTED',
      rejectionReason: 'Incorrect details',
    });
    expect(() =>
      companyTransition(
        { approvalStatus: 'PENDING', suspended: false },
        'reject',
        ' ',
      ),
    ).toThrow();
    expect(() =>
      companyTransition(
        { approvalStatus: 'PENDING', suspended: false },
        'reactivate',
      ),
    ).toThrow();
    expect(() =>
      companyTransition(
        { approvalStatus: 'ACTIVE', suspended: false },
        'approve',
      ),
    ).toThrow();
    expect(() =>
      companyTransition(
        { approvalStatus: 'ACTIVE', suspended: false },
        'suspend',
      ),
    ).toThrow();
    expect(
      companyTransition(
        { approvalStatus: 'ACTIVE', suspended: false },
        'suspend',
        'Security review',
      ),
    ).toMatchObject({ suspended: true });
    expect(
      companyTransition(
        { approvalStatus: 'ACTIVE', suspended: true },
        'reactivate',
      ),
    ).toMatchObject({ suspended: false });
  });
  it.each(['SUPER_ADMIN', 'COMPANY_MANAGER'])(
    'allows %s company administration',
    (role) => {
      expect(companyPermissions(role)).toEqual({ read: true, write: true });
    },
  );
  it('gives Support metadata reads only and Billing no company access', () => {
    expect(companyPermissions('SUPPORT')).toEqual({ read: true, write: false });
    expect(companyPermissions('BILLING')).toEqual({
      read: false,
      write: false,
    });
    expect(companyPermissions('COMPANY_ADMIN')).toEqual({
      read: false,
      write: false,
    });
  });
});
