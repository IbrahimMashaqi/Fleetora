import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ParcelTransaction } from './parcel-store.js';

export const CURRENCIES = ['ILS', 'USD', 'EUR', 'JOD'] as const;
export type Currency = (typeof CURRENCIES)[number];

/**
 * OD-02 / BR-066 / FR-PL-06: a company operates in exactly one currency.
 * Returns the persisted company currency. A currency supplied by the client is
 * accepted only when it equals that currency; it never selects another one.
 * The (companyId, currency) foreign keys enforce the same invariant in the database.
 */
export async function companyCurrency(
  tx: ParcelTransaction,
  companyId: string,
  supplied?: string,
): Promise<string> {
  const company = await tx.orm.public.Company.where({ id: companyId })
    .select('currency')
    .first();
  if (!company) throw new NotFoundException('Company not found');
  if (supplied !== undefined && supplied !== company.currency)
    throw new BadRequestException(
      `Currency must be the company currency (${company.currency})`,
    );
  return company.currency;
}
