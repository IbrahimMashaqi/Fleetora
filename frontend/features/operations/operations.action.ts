"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { operationsForSession } from "./operations.server";
import type { Operation, Scope } from "./operations-contract";
export async function operationsAction(scope: Scope, operation: Operation) {
  const result = await operationsForSession(await cookies(), scope, operation);
  if (result.status === "unauthenticated") redirect("/login");
  return result;
}
