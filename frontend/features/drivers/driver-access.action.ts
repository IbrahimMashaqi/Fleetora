"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { driverAccessForSession } from "./driver-access.server";
import type { DriverScope } from "./drivers.types";
import type { DriverAccessOperation } from "./driver-access.types";
export async function driverAccessAction(
  scope: DriverScope,
  operation: DriverAccessOperation,
) {
  const result = await driverAccessForSession(
    await cookies(),
    scope,
    operation,
  );
  if (result.status === "unauthenticated") redirect("/login");
  return result;
}
