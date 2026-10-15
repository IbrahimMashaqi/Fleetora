'use client';
import { useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { MerchantRequest, MerchantScope } from '../merchants.types';
import { useMerchantRead } from '../use-merchant-read';
import { MerchantReadError } from './merchant-feedback';

export function MerchantDetails({ id, scope, onClose }: { id: string; scope: MerchantScope; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useMemo<MerchantRequest>(() => ({ kind: 'detail', id }), [id]);
  const { result, retry } = useMerchantRead(request, scope);
  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);
  const merchant = result?.status === 'detail' ? result.data : null;
  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="merchant-details-title"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 text-foreground shadow-lg backdrop:bg-sidebar-navy/55 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 id="merchant-details-title" className="text-lg font-semibold">Merchant account details</h2>
        <Button type="button" autoFocus variant="ghost" size="sm" onClick={() => dialog.current?.close()}>Close details</Button>
      </div>
      <div className="mt-6">
        {!result ? <p role="status" className="text-sm text-muted-foreground">Loading merchant account...</p> : merchant ? (
          <dl className="space-y-5 text-sm">
            {[
              ['Name', merchant.name || 'Name not provided'], ['Email', merchant.email || 'Email not provided'],
              ['Account status', merchant.isActive ? 'Active' : 'Inactive'],
              ['Email verification', merchant.isEmailVerified ? 'Verified' : 'Unverified'],
            ].map(([label, value]) => <div key={label}><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 font-medium leading-6 [overflow-wrap:anywhere]">{value}</dd></div>)}
          </dl>
        ) : <MerchantReadError status={result.status} retry={retry} />}
      </div>
    </dialog>
  );
}
