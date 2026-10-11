import type { Metadata } from "next";
import { EmailVerification } from "@/features/auth/components/email-verification";

export const metadata: Metadata = {
  title: "Verify your email",
  referrer: "no-referrer",
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string | string[]; token?: string | string[] }>;
}) {
  const params = await searchParams;
  const userId = typeof params.userId === "string" ? params.userId : "";
  const legacyTokenInQuery = typeof params.token === "string";
  const initialState = userId && !legacyTokenInQuery
    ? { status: "confirmation-required" as const }
    : { status: "invalid" as const };

  return (
    <EmailVerification
      userId={userId}
      initialState={initialState}
      legacyTokenInQuery={legacyTokenInQuery}
    />
  );
}
