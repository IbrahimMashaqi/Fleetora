import type { Metadata } from "next";
import { PlatformActivation } from "@/features/platform/platform-activation";
export const metadata: Metadata = {
  title: "Activate Fleetora Platform",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <PlatformActivation />;
}
