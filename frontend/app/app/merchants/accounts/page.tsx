import { MerchantsDirectory } from '@/features/merchants/components/merchants-directory';
export default async function LegacyMerchantAccounts({ searchParams }: { searchParams: Promise<{ search?: string; page?: string }> }) {
  const query = await searchParams;
  return <MerchantsDirectory query={{ search: typeof query.search === 'string' ? query.search : '', page: query.page === undefined ? 1 : Number(query.page), pageSize: 20 }} />;
}
