"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fleetForSession } from "./vehicles.server";
import type { FleetOperation, FleetScope } from "./vehicles.types";
export async function fleetAction(
  scope: FleetScope,
  operation: FleetOperation,
) {
  const result = await fleetForSession(await cookies(), scope, operation);
  if (result.status === "unauthenticated") redirect("/login");
  return result;
}
