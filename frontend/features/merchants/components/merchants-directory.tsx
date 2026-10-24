'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProtectedSession } from '@/features/auth/session/session-context';
import { useLocale } from '@/lib/i18n';
import type { MerchantQuery, MerchantRequest, MerchantScope } from '../merchants.types';
import { useMerchantRead } from '../use-merchant-read';
import { MerchantDetails } from './merchant-details';
import { MerchantAccessDenied, MerchantReadError } from './merchant-feedback';

function location(search: string, page = 1) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (page !== 1) params.set('page', String(page));
  return `/app/merchants/accounts${params.size ? `?${params}` : ''}`;
}

export function MerchantsDirectory({ query }: { query: MerchantQuery }) {
  const { user } = useProtectedSession();
  if (user.role !== 'COMPANY_ADMIN' || !user.company || !user.orgId) return <MerchantAccessDenied />;
  return <MerchantList key={JSON.stringify([user.id, user.orgId, query])} scope={{ userId: user.id, companyId: user.orgId }} query={query} />;
}

function MerchantList({ scope, query }: { scope: MerchantScope; query: MerchantQuery }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const request = useMemo<MerchantRequest>(() => ({ kind: 'list', query }), [query]);
  const { result, retry } = useMerchantRead(request, scope);
  const [selected, setSelected] = useState<string | null>(null);
  const data = result?.status === 'list' ? result.data : null;
  return (
    <div className="mx-auto w-full max-w-5xl min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t("Merchant accounts")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("Merchant accounts associated with your company.")}</p>
        </div>
        <Button type="button" variant="outline" disabled={!result} onClick={retry}>{t("Refresh")}</Button>
      </div>
      <form role="search" className="my-6 flex min-w-0 flex-wrap items-end gap-3" onSubmit={event => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get('search');
        router.push(location(typeof value === 'string' ? value.trim() : ''));
      }}>
        <div className="min-w-0 flex-1 basis-56 space-y-2">
          <Label htmlFor="merchant-search">{t("Search merchant accounts")}</Label>
          <Input id="merchant-search" type="search" name="search" maxLength={100} defaultValue={query.search} placeholder={t("Search by name or email")} />
        </div>
        <Button type="submit">{t("Search")}</Button>
        {query.search && <Button asChild variant="ghost"><Link href="/app/merchants/accounts">{t("Clear search")}</Link></Button>}
      </form>

      {!result ? (
        <div role="status" aria-live="polite" className="rounded-lg border border-border bg-surface p-6 text-sm text-muted-foreground">{t("Loading merchant accounts...")}</div>
      ) : !data ? <MerchantReadError status={result.status} retry={retry} /> : (
        <>
          {data.items.length === 0 ? (
            <section className="rounded-lg border border-border bg-surface px-5 py-10 text-center" aria-labelledby="merchant-empty-title">
              <h3 id="merchant-empty-title" className="text-base font-semibold">{query.page > 1 ? t("No accounts on this page.") : query.search ? t("No merchant accounts match your search.") : t("No merchant accounts yet.")}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{query.search ? t("Try a different name or email.") : t("No merchant accounts are linked on this page.")}</p>
              {query.page > 1 && <Button asChild variant="outline" className="mt-4"><Link href={location(query.search)}>{t("Back to first page")}</Link></Button>}
            </section>
          ) : (
            <ul aria-label={t("Merchant accounts")} className="min-w-0 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {data.items.map(merchant => (
                <li key={merchant.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 p-4 sm:p-5">
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <p className="text-sm font-semibold leading-6 [overflow-wrap:anywhere]">{merchant.name || t("Name not provided")}</p>
                    <p className="mt-0.5 text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">{merchant.email || t("Email not provided")}</p>
                  </div>
                  <div className="col-start-1 row-start-2 flex min-w-0 flex-wrap gap-2">
                    <span className={`rounded-md border px-2 py-1 text-xs font-medium ${merchant.isActive ? 'border-success-border bg-success-background' : 'border-border bg-muted'}`}>{merchant.isActive ? t("Active") : t("Inactive")}</span>
                    <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">{merchant.isEmailVerified ? t("Email verified") : t("Email unverified")}</span>
                  </div>
                  <Button type="button" variant="outline" size="sm" aria-label={t("View {name}", { name: merchant.name || t("Merchant accounts") })} className="col-start-2 row-start-2 self-center sm:row-span-2 sm:row-start-1" onClick={() => setSelected(merchant.id)}>{t("View details")}</Button>
                </li>
              ))}
            </ul>
          )}
          <nav aria-label={t("Merchant pagination")} className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t("Page {page}", { page: data.page.toLocaleString(locale) })}</p>
            <div className="flex gap-2">
              {data.page > 1 ? <Button asChild variant="outline" size="sm"><Link aria-label={t("Previous")} href={location(query.search, data.page - 1)}>{t("Previous")}</Link></Button> : <Button type="button" variant="outline" size="sm" aria-label={t("Previous")} disabled>{t("Previous")}</Button>}
              {data.hasNext ? <Button asChild variant="outline" size="sm"><Link aria-label={t("Next")} href={location(query.search, data.page + 1)}>{t("Next")}</Link></Button> : <Button type="button" variant="outline" size="sm" aria-label={t("Next")} disabled>{t("Next")}</Button>}
            </div>
          </nav>
        </>
      )}
      {selected && <MerchantDetails id={selected} scope={scope} onClose={() => setSelected(null)} />}
    </div>
  );
}
