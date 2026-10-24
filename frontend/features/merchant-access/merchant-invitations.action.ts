"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { merchantInvitationsForSession } from "./merchant-invitations.server";
import type {
  InvitationOperation,
  InvitationScope,
} from "./merchant-invitations.types";

export async function merchantInvitationsAction(
  scope: InvitationScope,
  merchantId: string,
  operation: InvitationOperation,
) {
  const result = await merchantInvitationsForSession(
    await cookies(),
    scope,
    merchantId,
    operation,
  );
  if (result.status === "unauthenticated") redirect("/login");
  return result;
}
