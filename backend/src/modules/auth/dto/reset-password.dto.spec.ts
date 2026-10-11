import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ResetPasswordDto } from './reset-password.dto.js';

describe('ResetPasswordDto', () => {
  const validInput = {
    id: '00000000-0000-4000-8000-000000000001',
    token: 'a'.repeat(64),
    newPassword: 'Fleetora1',
  };

  it('accepts a reset password that matches the signup policy', async () => {
    const dto = Object.assign(new ResetPasswordDto(), validInput);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['short', 'lowercase-only', ''])('rejects a password that violates signup policy: %s', async (newPassword) => {
    const dto = Object.assign(new ResetPasswordDto(), { ...validInput, newPassword });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'newPassword')).toBe(true);
  });
});
