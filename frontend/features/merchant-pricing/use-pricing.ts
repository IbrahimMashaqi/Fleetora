"use client";
import { useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { withSessionLock } from "@/lib/auth/session-lock";
import { pricingAction } from "./pricing.action";
import type {
  PricingOperation,
  PricingResult,
  Scope,
} from "./pricing-contract";
export function usePricing(scope: Scope, operation: PricingOperation) {
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    result: PricingResult;
  } | null>(null);
  const key = JSON.stringify([scope, operation, attempt]);
  const pending = useRef<{ key: string; task: Promise<PricingResult> } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    if (pending.current?.key !== key)
      pending.current = {
        key,
        task: withSessionLock(() => pricingAction(scope, operation)),
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
  }, [key, scope, operation]);
  return {
    result: response?.key === key ? response.result : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
