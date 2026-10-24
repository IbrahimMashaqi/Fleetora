import { ParcelDetail } from "@/features/operations/components/parcel-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ParcelDetail id={(await params).id} />;
}
