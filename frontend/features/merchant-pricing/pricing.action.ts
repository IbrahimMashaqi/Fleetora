"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pricingForSession } from "./pricing.server";
import type { PricingOperation, Scope } from "./pricing-contract";
export async function pricingAction(scope: Scope, operation: PricingOperation) {
  const result = await pricingForSession(await cookies(), scope, operation);
  if (result.status === "unauthenticated") redirect("/login");
  return result;
}
