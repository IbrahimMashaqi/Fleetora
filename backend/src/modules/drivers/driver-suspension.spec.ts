import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { DriverSuspensionDto } from './dto/driver-input.dto.js';
describe('BR-118 documented suspension reason', () => {
  it('rejects a suspension without a documented reason', () => {
    expect(validateSync(Object.assign(new DriverSuspensionDto(), { suspended: true }))).not.toHaveLength(0);
  });
  it('allows reactivation without inventing a suspension reason', () => {
    expect(validateSync(Object.assign(new DriverSuspensionDto(), { suspended: false }))).toHaveLength(0);
  });
  it('accepts a documented reason and rejects blank/oversized reasons', () => {
    expect(validateSync(Object.assign(new DriverSuspensionDto(), { suspended: true, reason: 'Documented operational review' }))).toHaveLength(0);
    for (const reason of ['', 'x'.repeat(501)]) expect(validateSync(Object.assign(new DriverSuspensionDto(), { suspended: true, reason }))).not.toHaveLength(0);
  });
});
