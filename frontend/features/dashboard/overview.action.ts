"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { overviewForSession } from "./overview.server";
import type { OverviewScope } from "./overview-contract";

export async function overviewAction(scope: OverviewScope) {
  const result = await overviewForSession(await cookies(), scope);
  if (result.status === "unauthenticated") redirect("/login");
  return result;
}
