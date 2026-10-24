"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { withSessionLock } from "@/lib/auth/session-lock";
import { fleetAction } from "./vehicles.action";
import type { FleetScope, FleetResult } from "./vehicles.types";
import { subscribeToVehicleChanges } from "./vehicle-events";
export function useVehicles(
  scope: FleetScope,
  search: string,
  page: number,
  unassigned = false,
) {
  const [attempt, setAttempt] = useState(0);
  const { userId, companyId } = scope;
  useEffect(
    () =>
      subscribeToVehicleChanges({ userId, companyId }, () =>
        setAttempt((value) => value + 1),
      ),
    [userId, companyId],
  );
  const [response, setResponse] = useState<{
    key: string;
    result: FleetResult;
  } | null>(null);
  const request = useMemo(
    () => ({
      kind: "list" as const,
      query: { search, page, pageSize: 20 },
      unassigned,
    }),
    [search, page, unassigned],
  );
  const key = JSON.stringify([scope.userId, scope.companyId, request, attempt]);
  const pending = useRef<{ key: string; task: Promise<FleetResult> } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    if (pending.current?.key !== key)
      pending.current = {
        key,
        task: withSessionLock(() => fleetAction(scope, request)),
      };
    void pending.current.task
      .then((result) => {
        if (active) setResponse({ key, result });
      })
      .catch((error) => {
        unstable_rethrow(error);
        if (active) setResponse({ key, result: { status: "unavailable" } });
      });
    return () => {
      active = false;
    };
  }, [key, scope, request]);
  return {
    result: response?.key === key ? response.result : null,
    retry: () => setAttempt((v) => v + 1),
  };
}
