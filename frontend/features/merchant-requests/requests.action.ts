"use server";
import { cookies } from "next/headers";
import { requestsForSession } from "./requests.server";
import type { RequestOperation, Scope } from "./requests.types";
export async function requestsAction(
  scope: Scope,
  operation: RequestOperation,
) {
  return requestsForSession(await cookies(), scope, operation);
}
