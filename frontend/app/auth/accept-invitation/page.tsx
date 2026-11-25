import type { Metadata } from "next";
import { AcceptInvitationForm } from "@/features/staff/components/accept-invitation-form";

export const metadata: Metadata = {
  title: "Accept invitation",
  referrer: "no-referrer",
};

export default function AcceptInvitationPage() {
  return <AcceptInvitationForm />;
}
