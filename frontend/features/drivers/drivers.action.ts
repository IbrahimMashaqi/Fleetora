"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readDriversForSession } from "./drivers.server";
import type { DriverRequest, DriverScope } from "./drivers.types";

export async function readDriversAction(
  expected: DriverScope,
  request: DriverRequest,
) {
  const result = await readDriversForSession(
    await cookies(),
    expected,
    request,
  );
  if (result.status === "unauthenticated") redirect("/login");
  return result;
}
