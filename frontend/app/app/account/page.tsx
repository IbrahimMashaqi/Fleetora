import type { Metadata } from "next";
import { AccountOverview } from "@/features/account/components/account-overview";

export const metadata: Metadata = { title: "Account & security" };

export default function AccountPage() {
  return <AccountOverview />;
}
