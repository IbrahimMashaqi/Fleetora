"use client";

import type { SessionUser } from "@/lib/auth/session.types";
import { useOverview } from "../use-overview";
import { OverviewStatistics } from "./overview-statistics";

export function OverviewSection({ user }: { user: SessionUser }) {
  const { data, loading, error, retry } = useOverview(user);
  return <OverviewStatistics data={data} loading={loading} error={error} onRetry={retry} />;
}
