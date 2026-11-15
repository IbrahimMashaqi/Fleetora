import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { canonicalEmail, normalizeEmailInput } from './email.js';
import { CreateUserDto } from '../../modules/auth/dto/create-user.dto.js';
import { SigninDto } from '../../modules/auth/dto/signin.dto.js';
import { ForgotPasswordDto } from '../../modules/auth/dto/forgot-password.dto.js';
import {
  CompanyMerchantInvitationDto,
  MerchantInvitationDto,
} from '../../modules/merchant-access/merchant-access.dto.js';

describe('canonical email identity', () => {
  it('trims and lower-cases the whole address', () => {
    expect(canonicalEmail('  Amina.Hassan@Example.COM ')).toBe('amina.hassan@example.com');
  });

  it('leaves non-string input for validation to reject', () => {
    expect(normalizeEmailInput({ value: 42 })).toBe(42);
    expect(normalizeEmailInput({ value: undefined })).toBeUndefined();
  });

  it.each([
    ['signup', CreateUserDto, { name: 'Amina', password: 'Passw0rd' }],
    ['signin', SigninDto, { password: 'Passw0rd' }],
    ['password recovery', ForgotPasswordDto, {}],
    ['merchant owner invitation', MerchantInvitationDto, {}],
    ['company merchant invitation', CompanyMerchantInvitationDto, { role: 'OWNER' }],
  ])('normalizes the %s email before validation', async (_name, Dto, rest) => {
    const dto = plainToInstance(Dto as new () => { email: string }, { ...rest, email: ' Amina@Example.COM ' });
    expect(dto.email).toBe('amina@example.com');
    expect(await validate(dto)).toEqual([]);
  });

  it('still rejects malformed addresses after normalization', async () => {
    const dto = plainToInstance(SigninDto, { email: '  NOT AN EMAIL ', password: 'Passw0rd' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'email')).toBe(true);
  });
});
