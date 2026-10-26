"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { withSessionLock } from "@/lib/auth/session-lock";
import type { SessionUser } from "@/lib/auth/session.types";
import { overviewAction } from "./overview.action";
import type { OverviewResult } from "./overview-contract";

export function useOverview(user: SessionUser) {
  const userId = user.id;
  const companyId = user.orgId;
  const allowed = (user.role === "COMPANY_ADMIN" || user.role === "ACCOUNTANT") &&
    Boolean(companyId) && user.company?.id === companyId;
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ key: string; result: OverviewResult } | null>(null);
  const key = JSON.stringify([userId, companyId, user.role, allowed, attempt]);
  const pending = useRef<{ key: string; task: Promise<OverviewResult> } | null>(null);

  useEffect(() => {
    if (!allowed || !companyId) return;
    let active = true;
    if (pending.current?.key !== key) {
      pending.current = {
        key,
        task: withSessionLock(() => overviewAction({ userId, companyId })),
      };
    }
    void pending.current.task.then((result) => {
      if (active) setResponse({ key, result });
    }).catch((error) => {
      unstable_rethrow(error);
      if (active) setResponse({ key, result: { status: "unavailable" } });
    });
    return () => { active = false; };
  }, [allowed, companyId, userId, key]);

  const retry = useCallback(() => setAttempt((previous) => previous + 1), []);
  // Fence at render time too: a newly signed-in identity must never see old aggregates.
  const result = allowed && response?.key === key ? response.result : null;
  const error: "unavailable" | "forbidden" | "changed" | null = !allowed
    ? "forbidden"
    : !result || result.status === "ready" ? null
      : result.status === "unauthenticated" ? "changed" : result.status;

  return {
    data: result?.status === "ready" ? result.data : null,
    loading: allowed && result === null,
    error,
    retry,
  };
}
