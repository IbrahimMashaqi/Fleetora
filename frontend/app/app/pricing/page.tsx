import type { Metadata } from "next";
import { PricingWorkspace } from "@/features/merchant-pricing/pricing-workspace";
export const metadata: Metadata = { title: "Delivery pricing" };
export default function PricingPage() {
  return <PricingWorkspace />;
}
