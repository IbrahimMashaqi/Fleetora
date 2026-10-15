export type MerchantAccount = { id: string; name: string; email: string | null; isActive: boolean; isEmailVerified: boolean };
export type MerchantQuery = { search: string; page: number; pageSize: number };
export type MerchantPage = { items: MerchantAccount[]; page: number; pageSize: number; hasNext: boolean };
export type MerchantScope = { userId: string; companyId: string };
export type MerchantRequest = { kind: 'list'; query: MerchantQuery } | { kind: 'detail'; id: string };
export type MerchantResult =
  | { status: 'list'; data: MerchantPage }
  | { status: 'detail'; data: MerchantAccount }
  | { status: 'unauthenticated' | 'forbidden' | 'changed' | 'invalid' | 'not-found' | 'unavailable' };
