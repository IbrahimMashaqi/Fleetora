"use client";
import { useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { readClient } from "@/lib/api/read.client";
import type {
  WarehouseQuery,
  WarehouseResult,
  WarehouseScope,
} from "./warehouses.types";

export function useWarehouseRead(query: WarehouseQuery, scope: WarehouseScope) {
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    result: WarehouseResult;
  } | null>(null);
  const pending = useRef<{
    key: string;
    task: Promise<WarehouseResult>;
  } | null>(null);
  const { userId, companyId } = scope;
  const key = JSON.stringify([userId, companyId, query, attempt]);
  useEffect(() => {
    let active = true;
    if (pending.current?.key !== key) {
      const task = readClient("warehouses", { userId, companyId }, query);
      pending.current = { key, task };
    }
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
  }, [key, userId, companyId, query]);
  return {
    result: response?.key === key ? response.result : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
