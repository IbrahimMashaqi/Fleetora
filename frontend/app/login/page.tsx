import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ logout?: string; password?: string }>;
}) {
  const params = await searchParams;
  return <LoginForm logoutUnconfirmed={params.logout === "unconfirmed"} passwordReset={params.password === "reset"} />;
}
