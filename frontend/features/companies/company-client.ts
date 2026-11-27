"use client";
import { useCallback } from "react";
import { useProtectedSession } from "@/features/auth/session/session-context";
import { notifySessionChange } from "@/features/auth/session/session-events";
import { withSessionLock } from "@/lib/auth/session-lock";
import { record } from "@/features/platform/platform-contract";
export function useCompanyRequest(platform = false) {
  const { user } = useProtectedSession();
  return useCallback(
    (operation: Record<string, unknown>) =>
      withSessionLock(async () => {
        try {
          const response = await fetch(
            platform ? "/api/platform" : "/api/company",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...operation,
                userId: user.id,
                ...(!platform ? { companyId: user.orgId } : {}),
              }),
              cache: "no-store",
              redirect: "error",
              signal: AbortSignal.timeout(20000),
            },
          );
          const result: unknown = await response.json();
          if (response.status === 401) notifySessionChange();
          return record(result) ? result : { status: "unavailable" };
        } catch {
          return { status: "unavailable" };
        }
      }),
    [platform, user.id, user.orgId],
  );
}
