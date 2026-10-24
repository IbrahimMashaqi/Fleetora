"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { trackingForSession } from "./fleet.server";
import type { FleetOperation, FleetScope } from "./fleet.types";

export async function trackingAction(scope: FleetScope, operation: FleetOperation) {
  const result = await trackingForSession(await cookies(), scope, operation);
  if (result.status === "unauthenticated") redirect("/login");
  return result;
}
