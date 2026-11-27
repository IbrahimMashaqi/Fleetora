"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkDriverPhoneForSession, readDriversForSession, writeDriverForSession } from "./drivers.server";
import type { DriverRequest, DriverScope, DriverWrite } from "./drivers.types";

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

export async function checkDriverPhoneAction(
  expected: DriverScope,
  input: { phone: string; excludeId?: string },
) {
  const result = await checkDriverPhoneForSession(
    await cookies(),
    expected,
    input,
  );
  if (result.status === "unauthenticated") redirect("/login");
  return result;
}

export async function writeDriverAction(
  expected: DriverScope,
  operation: DriverWrite,
) {
  const result = await writeDriverForSession(
    await cookies(),
    expected,
    operation,
  );
  if (result.status === "unauthenticated") redirect("/login");
  return result;
}
