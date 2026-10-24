"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { withSessionLock } from "@/lib/auth/session-lock";
import { useProtectedSession } from "@/features/auth/session/session-context";
import { operationsAction } from "./operations.action";
import type { Operation, Result, Scope } from "./operations-contract";

export function useOperationScope(): Scope {
  const { user } = useProtectedSession();
  return useMemo(
    () => ({ userId: user.id, companyId: user.orgId ?? "" }),
    [user.id, user.orgId],
  );
}
export function useOperations(scope: Scope, request: Operation) {
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    result: Result;
  } | null>(null);
  const key = JSON.stringify([scope.userId, scope.companyId, request, attempt]);
  const pending = useRef<{ key: string; task: Promise<Result> } | null>(null);
  useEffect(() => {
    let active = true;
    if (pending.current?.key !== key)
      pending.current = {
        key,
        task: withSessionLock(() =>
          operationsAction(
            { userId: scope.userId, companyId: scope.companyId },
            request,
          ),
        ),
      };
    void pending.current.task
      .then((result) => {
        if (active)
          setResponse((previous) =>
            previous?.key === key ? previous : { key, result },
          );
      })
      .catch((error) => {
        unstable_rethrow(error);
        if (active)
          setResponse((previous) =>
            previous?.key === key
              ? previous
              : { key, result: { status: "unavailable" } },
          );
      });
    return () => {
      active = false;
    };
  }, [key, scope.userId, scope.companyId, request]);
  return {
    result: response?.key === key ? response.result : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
