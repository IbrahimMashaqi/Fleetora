import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/i18n';
import { NoAccess } from '@/components/shared/no-access';
import type { MerchantResult } from '../merchants.types';

export function MerchantAccessDenied() {
  return <NoAccess />;
}

export function MerchantReadError({ status, retry }: { status: MerchantResult['status']; retry: () => void }) {
  const { t } = useLocale();
  if (status === 'forbidden') return <MerchantAccessDenied />;
  const message = status === 'not-found' ? t("Merchant account not found.")
    : status === 'invalid' ? t("Check the search and page values, then try again.")
    : status === 'changed' ? t("Your session changed. Reload this page to continue.")
    : t("We couldn’t load merchant accounts. Please try again.");
  return (
    <div className="rounded-lg border border-border bg-surface p-5 sm:p-6">
      <p role="alert" className="text-sm leading-6">{message}</p>
      {status === 'unavailable' && <Button type="button" variant="outline" className="mt-4" onClick={retry}>{t("Try again")}</Button>}
      {status === 'changed' && <Button type="button" variant="outline" className="mt-4" onClick={() => window.location.reload()}>{t("Reload directory")}</Button>}
      {status === 'invalid' && <Button asChild variant="outline" className="mt-4"><Link href="/app/merchants/accounts">{t("Reset search")}</Link></Button>}
    </div>
  );
}
