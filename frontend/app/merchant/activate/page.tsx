import type { Metadata } from "next";
import { MerchantActivationPage } from "@/features/merchant-access/merchant-activation-page";

export const metadata: Metadata = {
  title: "Activate Fleetora Merchant",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <MerchantActivationPage />;
}
