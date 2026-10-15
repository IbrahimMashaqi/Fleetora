import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { MerchantResult } from '../merchants.types';

export function MerchantAccessDenied() {
  return (
    <section className="mx-auto max-w-3xl" aria-labelledby="merchant-access-title">
      <h2 id="merchant-access-title" className="text-xl font-semibold">Company administrator access required</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">This directory is available to company administrators in their own workspace.</p>
      <Button asChild variant="outline" className="mt-5"><Link href="/app">Back to Overview</Link></Button>
    </section>
  );
}

export function MerchantReadError({ status, retry }: { status: MerchantResult['status']; retry: () => void }) {
  if (status === 'forbidden') return <MerchantAccessDenied />;
  const message = status === 'not-found' ? 'Merchant account not found.'
    : status === 'invalid' ? 'Check the search and page values, then try again.'
    : status === 'changed' ? 'Your session changed. Reload this page to continue.'
    : 'We couldn’t load merchant accounts. Please try again.';
  return (
    <div className="rounded-lg border border-border bg-surface p-5 sm:p-6">
      <p role="alert" className="text-sm leading-6">{message}</p>
      {status === 'unavailable' && <Button type="button" variant="outline" className="mt-4" onClick={retry}>Try again</Button>}
      {status === 'changed' && <Button asChild variant="outline" className="mt-4"><a href="/app/merchants">Reload directory</a></Button>}
      {status === 'invalid' && <Button asChild variant="outline" className="mt-4"><Link href="/app/merchants">Reset search</Link></Button>}
    </div>
  );
}
