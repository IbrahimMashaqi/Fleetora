import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  AcceptMerchantInvitationDto,
  CompanyMerchantInvitationDto,
  MerchantInvitationDto,
  UpdateMerchantEmployeeDto,
} from './merchant-access.dto.js';

describe('merchant access request validation', () => {
  it('normalizes invited email and rejects unknown grants', async () => {
    const valid = plainToInstance(MerchantInvitationDto, {
      email: ' Person@Example.com ',
      permissions: ['PARCEL_VIEW'],
    });
    expect(valid.email).toBe('person@example.com');
    expect(await validate(valid)).toEqual([]);
    expect(
      await validate(
        plainToInstance(MerchantInvitationDto, {
          email: 'person@example.com',
          permissions: ['ADMIN'],
        }),
      ),
    ).not.toEqual([]);
  });
  it('validates expiry and intended role', async () => {
    expect(
      await validate(
        plainToInstance(CompanyMerchantInvitationDto, {
          email: 'person@example.com',
          role: 'EMPLOYEE',
          expiresInHours: 168,
        }),
      ),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(CompanyMerchantInvitationDto, {
          email: 'person@example.com',
          role: 'COMPANY_ADMIN',
        }),
      ),
    ).not.toEqual([]);
    expect(
      await validate(
        plainToInstance(MerchantInvitationDto, {
          email: 'person@example.com',
          expiresInHours: 169,
        }),
      ),
    ).not.toEqual([]);
  });
  it('rejects malformed tokens and bcrypt truncation', async () => {
    expect(
      await validate(
        plainToInstance(AcceptMerchantInvitationDto, {
          token: 'short',
          password: 'Password',
        }),
      ),
    ).not.toEqual([]);
    expect(
      await validate(
        plainToInstance(AcceptMerchantInvitationDto, {
          token: 'a'.repeat(64),
          password: 'ع'.repeat(40),
        }),
      ),
    ).not.toEqual([]);
  });
  it('requires boolean employee state and separate finance capability', async () => {
    expect(
      await validate(
        plainToInstance(UpdateMerchantEmployeeDto, { active: 'false' }),
      ),
    ).not.toEqual([]);
    expect(
      await validate(
        plainToInstance(UpdateMerchantEmployeeDto, {
          active: false,
          permissions: ['SETTLEMENT_REQUEST'],
        }),
      ),
    ).toEqual([]);
  });
});
