"use client";
import type { ReadOperations, ReadResults } from "./read-contract";
import type { Scope } from "@/features/operations/operations-contract";
import { withSessionLock } from "@/lib/auth/session-lock";
import { notifySessionChange } from "@/features/auth/session/session-events";

/** Same-origin, read-only BFF: cookie refresh never triggers an RSC navigation. */
export async function readClient<K extends keyof ReadOperations>(
  area: K,
  scope: Scope,
  operation: ReadOperations[K],
): Promise<ReadResults[K]> {
  return withSessionLock(async () => {
    const response = await fetch("/api/read", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ area, scope, operation }),
    });
    if (!response.ok) throw new Error("Read unavailable");
    // The handler returns the existing validated and serialized feature contract.
    const result: ReadResults[K] = await response.json();
    if (result.status === "unauthenticated") notifySessionChange();
    return result;
  });
}
