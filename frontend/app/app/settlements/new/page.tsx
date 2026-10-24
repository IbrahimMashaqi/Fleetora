import { SettlementPreview } from "@/features/operations/components/settlement-detail";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ merchantId?: string }>;
}) {
  return <SettlementPreview merchantId={(await searchParams).merchantId} />;
}
