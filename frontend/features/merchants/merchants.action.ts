'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readMerchantsForSession } from './merchants.server';
import type { MerchantRequest, MerchantScope } from './merchants.types';

export async function readMerchantsAction(expected: MerchantScope, request: MerchantRequest) {
  const result = await readMerchantsForSession(await cookies(), expected, request);
  if (result.status === 'unauthenticated') redirect('/login');
  return result;
}
