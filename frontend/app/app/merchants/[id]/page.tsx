import { MerchantDetail } from '@/features/operations/components/merchant-detail';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <MerchantDetail id={(await params).id} />; }
