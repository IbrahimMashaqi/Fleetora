import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth/password-recovery/reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; userId?: string }>;
}) {
  const params = await searchParams;
  return (
    <ResetPasswordForm
      userId={params.userId ?? ""}
      legacyTokenInQuery={Boolean(params.token)}
    />
  );
}
