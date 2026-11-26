import { describe, expect, it } from 'vitest';
import { assertActiveMerchant } from './parcel-domain.js';

describe('OD-13/BR-093 merchant activation gate', () => {
  it('lets only ACTIVE merchants operate', () => {
    expect(() => assertActiveMerchant({ activationStatus: 'ACTIVE' })).not.toThrow();
    for (const activationStatus of ['PENDING', 'SUSPENDED', ''])
      expect(() => assertActiveMerchant({ activationStatus })).toThrow(
        expect.objectContaining({ status: 409 }),
      );
  });
});
