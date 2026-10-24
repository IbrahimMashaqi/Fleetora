import { SettlementDetail } from "@/features/operations/components/settlement-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <SettlementDetail id={(await params).id} />;
}
