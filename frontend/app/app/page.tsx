"use client";

import { DashboardOverview } from "@/features/dashboard/components/dashboard-overview";
import { useProtectedSession } from "@/features/auth/session/session-context";

export default function AppPage() {
  const { user } = useProtectedSession();
  return <DashboardOverview user={user} />;
}
