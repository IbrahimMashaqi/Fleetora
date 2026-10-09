import type { Metadata } from "next";
import { EmailVerification } from "@/features/auth/components/email-verification";
import { verifyEmailAction } from "@/features/auth/verification.action";

export const metadata: Metadata = {
  title: "Verify your email",
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string | string[]; token?: string | string[] }>;
}) {
  const params = await searchParams;
  const userId = typeof params.userId === "string" ? params.userId : "";
  const token = typeof params.token === "string" ? params.token : "";
  const initialState = await verifyEmailAction(userId, token);

  return <EmailVerification userId={userId} initialState={initialState} />;
}
