"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { accessCookie, refreshCookie, clearSessionCookies } from "@/lib/auth/cookies.server";
import { revokeSession } from "@/lib/auth/session.server";

export async function logoutAction() {
  const jar = await cookies();
  const confirmed = await revokeSession({ access: jar.get(accessCookie)?.value, refresh: jar.get(refreshCookie)?.value });
  clearSessionCookies(jar);
  redirect(confirmed ? "/login" : "/login?logout=unconfirmed");
}
