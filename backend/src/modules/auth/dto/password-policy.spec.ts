import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateUserDto } from './create-user.dto.js';
import { ResetPasswordDto } from './reset-password.dto.js';
import { UpdatePasswordDto } from './update-password.dto.js';
import { SigninDto } from './signin.dto.js';

const id = '11111111-1111-4111-8111-111111111111';
const entries = [
  { name: 'signup', make: (password: string) => plainToInstance(CreateUserDto, { name: 'Fixture', email: 'password@example.invalid', password }), field: 'password' },
  { name: 'reset', make: (password: string) => plainToInstance(ResetPasswordDto, { id, token: 'a'.repeat(64), newPassword: password }), field: 'newPassword' },
  { name: 'update', make: (password: string) => plainToInstance(UpdatePasswordDto, { oldPassword: 'ExistingPassword', newPassword: password }), field: 'newPassword' },
];

describe('backend new-password contract', () => {
  for (const entry of entries) {
    for (const password of ['Aa1234', 'A' + 'a'.repeat(71), 'A' + 'é'.repeat(35) + 'a']) {
      it(`${entry.name} accepts ${Array.from(password).length} characters/${Buffer.byteLength(password, 'utf8')} bytes`, async () => {
        expect(await validate(entry.make(password))).toHaveLength(0);
      });
    }
    for (const password of ['Aa123', 'abcdef', 'A' + 'a'.repeat(72), 'A' + 'é'.repeat(36), 'A😀😀a']) {
      it(`${entry.name} rejects ${Array.from(password).length} characters/${Buffer.byteLength(password, 'utf8')} bytes`, async () => {
        const errors = await validate(entry.make(password), { validationError: { target: false, value: false } });
        expect(errors.some(error => error.property === entry.field)).toBe(true);
        expect(JSON.stringify(errors)).not.toContain(password);
      });
    }
  }

  it('keeps legacy lowercase signin compatibility', async () => {
    expect(await validate(plainToInstance(SigninDto, { email: 'password@example.invalid', password: 'abcdef' }))).toHaveLength(0);
  });
});
