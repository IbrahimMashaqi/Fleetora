import type { Metadata } from "next";
import { DriverActivationPage } from "@/features/drivers/components/driver-activation-page";
export const metadata: Metadata = {
  title: "Activate Fleetora Driver",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <DriverActivationPage />;
}
