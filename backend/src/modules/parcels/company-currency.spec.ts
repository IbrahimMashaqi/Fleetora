import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { companyCurrency } from './company-currency.js';
import type { ParcelTransaction } from './parcel-store.js';
import { CreateUserDto } from '../auth/dto/create-user.dto.js';

function tx(currency: string | null) {
  const company = currency === null ? null : { currency };
  return {
    orm: {
      public: {
        Company: {
          where: () => ({ select: () => ({ first: async () => company }) }),
        },
      },
    },
  } as unknown as ParcelTransaction;
}

describe('OD-02/BR-066 company currency', () => {
  it('returns the persisted company currency when none is supplied', async () => {
    await expect(companyCurrency(tx('JOD'), 'company')).resolves.toBe('JOD');
  });
  it('accepts a supplied currency only when it equals the company currency', async () => {
    await expect(companyCurrency(tx('USD'), 'company', 'USD')).resolves.toBe('USD');
    await expect(companyCurrency(tx('USD'), 'company', 'ILS')).rejects.toMatchObject({
      status: 400,
      message: 'Currency must be the company currency (USD)',
    });
  });
  it('rejects a missing company', async () => {
    await expect(companyCurrency(tx(null), 'company')).rejects.toMatchObject({ status: 404 });
  });
  it.each(['ILS', 'USD', 'EUR', 'JOD', undefined])('signup accepts currency %s', async (currency) => {
    const dto = plainToInstance(CreateUserDto, { name: 'Fixture', email: 'a@example.invalid', password: 'Passw0rd', currency });
    expect(await validate(dto)).toEqual([]);
  });
  it.each(['GBP', 'ils', ''])('signup rejects currency %s', async (currency) => {
    const dto = plainToInstance(CreateUserDto, { name: 'Fixture', email: 'a@example.invalid', password: 'Passw0rd', currency });
    expect((await validate(dto)).map((error) => error.property)).toEqual(['currency']);
  });
});
