import type { Metadata } from 'next';
import { MerchantsDirectory } from '@/features/merchants/components/merchants-directory';

export const metadata: Metadata = { title: 'Merchants' };

export default async function MerchantsPage({ searchParams }: { searchParams: Promise<{ search?: string | string[]; page?: string | string[] }> }) {
  const params = await searchParams;
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const page = params.page === undefined ? 1 : typeof params.page === 'string' && /^\d+$/.test(params.page) ? Number(params.page) : 0;
  return <MerchantsDirectory query={{ search, page: Array.isArray(params.search) ? 0 : page, pageSize: 20 }} />;
}
