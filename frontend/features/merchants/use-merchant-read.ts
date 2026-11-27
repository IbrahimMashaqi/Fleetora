'use client';
import { useEffect, useRef, useState } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { readClient } from "@/lib/api/read.client";
import type { MerchantRequest, MerchantResult, MerchantScope } from './merchants.types';

export function useMerchantRead(request: MerchantRequest, scope: MerchantScope) {
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ key: string; result: MerchantResult } | null>(null);
  const pending = useRef<{ key: string; task: Promise<MerchantResult> } | null>(null);
  const { userId, companyId } = scope;
  const key = JSON.stringify([userId, companyId, request, attempt]);
  useEffect(() => {
    let active = true;
    if (pending.current?.key !== key) {
      const task = ( readClient("merchants", { userId, companyId }, request));
      pending.current = { key, task };
    }
    void pending.current.task.then(result => {
      if (active) setResponse({ key, result });
    }).catch(error => {
      unstable_rethrow(error);
      if (active) setResponse({ key, result: { status: 'unavailable' } });
    });
    return () => { active = false; };
  }, [key, userId, companyId, request]);
  return { result: response?.key === key ? response.result : null, retry: () => setAttempt(value => value + 1) };
}
