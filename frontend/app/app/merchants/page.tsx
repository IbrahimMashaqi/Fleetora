import type { Metadata } from 'next';
import { OperationsDirectory } from '@/features/operations/components/operations-directory';
import { operationQuery, type OperationSearch } from '@/features/operations/operations-route';

export const metadata: Metadata = { title: 'Merchants' };

export default async function MerchantsPage({ searchParams }: { searchParams: OperationSearch }) {
  return <OperationsDirectory resource="merchants" query={await operationQuery(searchParams)} />;
}
