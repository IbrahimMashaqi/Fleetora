"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readStaffForSession, writeStaffForSession } from "./staff.server";
import type { StaffScope, StaffWrite } from "./staff.types";

export async function readStaffAction(expected: StaffScope) {
  const result = await readStaffForSession(await cookies(), expected);
  if (result.status === "unauthenticated") redirect("/login");
  return result;
}

export async function writeStaffAction(
  expected: StaffScope,
  operation: StaffWrite,
) {
  const result = await writeStaffForSession(
    await cookies(),
    expected,
    operation,
  );
  if (result.status === "unauthenticated") redirect("/login");
  return result;
}
