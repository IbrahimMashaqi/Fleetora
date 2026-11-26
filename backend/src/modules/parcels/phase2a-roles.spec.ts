import { describe, expect, it } from 'vitest';
import { capabilities, company } from './parcel-domain.js';

describe('BR-042/043 Phase 2a built-in permission matrix', () => {
  const matrix = {
    COMPANY_ADMIN: { view: true, manageMerchants: true, manageParcels: true, manageReturns: true, collect: true, remit: true, viewFinance: true, createSettlements: true, approveSettlements: true, paySettlements: true },
    ACCOUNTANT: { view: true, manageMerchants: false, manageParcels: false, manageReturns: false, collect: true, remit: true, viewFinance: true, createSettlements: true, approveSettlements: false, paySettlements: true },
    OPERATIONS: { view: true, manageMerchants: false, manageParcels: true, manageReturns: true, collect: false, remit: false, viewFinance: false, createSettlements: false, approveSettlements: false, paySettlements: false },
    WAREHOUSE: { view: true, manageMerchants: false, manageParcels: false, manageReturns: false, collect: false, remit: false, viewFinance: false, createSettlements: false, approveSettlements: false, paySettlements: false },
  };
  for (const [role, permissions] of Object.entries(matrix)) {
    for (const [permission, allowed] of Object.entries(permissions)) {
      it(`${role} ${allowed ? 'allows' : 'denies'} ${permission}`, () => {
        expect(capabilities(role)).toHaveProperty(permission, allowed);
      });
    }
  }
  for (const role of ['DRIVER', 'MERCHANT', 'PLATFORM_ADMIN', 'CUSTOM', '']) {
    it(`does not grant company capabilities to ${role || 'missing role'}`, () => {
      expect(Object.values(capabilities(role)).every(value => !value)).toBe(true);
    });
  }
  const operational = {
    COMPANY_ADMIN: [true, true, true, true, true, true],
    OPERATIONS: [true, true, true, true, false, false],
    WAREHOUSE: [true, true, false, false, false, false],
    ACCOUNTANT: [false, false, false, false, false, false],
  };
  for (const [role, allowed] of Object.entries(operational)) {
    ['warehouseOperations', 'advanceReturns', 'reviewPickups', 'manageDrivers', 'manageWarehouses', 'manageVehicles'].forEach((capability, index) => {
      it(`${role} operational boundary ${capability}`, () => expect(capabilities(role)).toHaveProperty(capability, allowed[index]));
    });
  }
  it('does not infer company access from a missing tenant', () => {
    expect(() => company({ sub: 'admin', role: 'COMPANY_ADMIN', orgId: '', email: '' })).toThrow();
  });
});
