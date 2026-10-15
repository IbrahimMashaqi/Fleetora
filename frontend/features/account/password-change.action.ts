"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { changePasswordForSession } from "./password-change.server";
import type { PasswordChangeState } from "./password-change.types";

export async function changePasswordAction(
  expectedUserId: string,
  _previousState: PasswordChangeState,
  formData: FormData,
): Promise<PasswordChangeState> {
  const result = await changePasswordForSession(await cookies(), expectedUserId, formData);
  if (result.status === "unauthenticated") redirect("/login");
  return result;
}
