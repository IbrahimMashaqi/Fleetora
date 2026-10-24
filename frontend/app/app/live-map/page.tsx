import type { Metadata } from "next";
import { LiveFleetPage } from "@/features/fleet/components/live-fleet";

export const metadata: Metadata = { title: "التتبع المباشر" };

export default function LiveMapPage() {
  return <LiveFleetPage />;
}
