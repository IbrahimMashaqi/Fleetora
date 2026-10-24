"use server";
import { cookies } from "next/headers";
import { pickupsForSession } from "./pickups.server";
import type { PickupOperation, Scope } from "./pickups.types";
export async function pickupsAction(scope: Scope, operation: PickupOperation) {
  return pickupsForSession(await cookies(), scope, operation);
}
