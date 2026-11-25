import type { Metadata } from "next";
import { StaffDirectory } from "@/features/staff/components/staff-directory";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage() {
  return <StaffDirectory />;
}
