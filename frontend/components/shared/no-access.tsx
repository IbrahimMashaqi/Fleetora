"use client";

import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n";

/** The one denied-access state for workspace pages; the backend remains authoritative. */
export function NoAccess() {
  const { t } = useLocale();
  return (
    <section
      data-no-access=""
      className="mx-auto max-w-3xl rounded-lg border border-border bg-surface p-6 sm:p-8"
      aria-labelledby="no-access-title"
    >
      <LockKeyhole aria-hidden="true" className="mb-4 size-6 text-muted-foreground" />
      <h2 id="no-access-title" className="text-xl font-semibold">
        {t("You don't have access to this page")}
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {t("Your role doesn't include this area. Ask your company administrator if you need access.")}
      </p>
      <Button asChild variant="outline" className="mt-5">
        <Link href="/app">{t("Back to Overview")}</Link>
      </Button>
    </section>
  );
}
