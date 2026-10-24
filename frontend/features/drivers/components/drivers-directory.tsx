"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProtectedSession } from "@/features/auth/session/session-context";
import { useLocale } from "@/lib/i18n";
import { DriverCard, DriverCardSkeletons } from "./driver-card";
import type { DriverQuery, DriverRequest, DriverScope } from "../drivers.types";
import { useDriverRead } from "../use-driver-read";
import { DriverDetails } from "./driver-details";
import { DriverAccessDenied, DriverReadError } from "./driver-feedback";

function location(search: string, page = 1) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (page !== 1) params.set("page", String(page));
  return `/app/drivers${params.size ? `?${params}` : ""}`;
}

export function DriversDirectory({ query }: { query: DriverQuery }) {
  const { user } = useProtectedSession();
  if (user.role !== "COMPANY_ADMIN" || !user.company || !user.orgId)
    return <DriverAccessDenied />;
  return (
    <DriverList
      key={JSON.stringify([user.id, user.orgId, query])}
      scope={{ userId: user.id, companyId: user.orgId }}
      query={query}
    />
  );
}

function DriverList({
  scope,
  query,
}: {
  scope: DriverScope;
  query: DriverQuery;
}) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const request = useMemo<DriverRequest>(
    () => ({ kind: "list", query }),
    [query],
  );
  const { result, retry } = useDriverRead(request, scope);
  const [selected, setSelected] = useState<string | null>(null);
  const data = result?.status === "list" ? result.data : null;
  return (
    <div className="mx-auto w-full max-w-5xl min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t("Drivers")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("Find and view the delivery drivers in your company.")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!result}
          onClick={retry}
        >
          {t("Refresh")}
        </Button>
      </div>
      <form
        role="search"
        className="my-6 flex min-w-0 flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("search");
          router.push(location(typeof value === "string" ? value.trim() : ""));
        }}
      >
        <div className="min-w-0 flex-1 basis-56 space-y-2">
          <Label htmlFor="driver-search">{t("Search drivers")}</Label>
          <Input
            id="driver-search"
            type="search"
            name="search"
            maxLength={100}
            defaultValue={query.search}
            placeholder={t("Search by name or phone")}
          />
        </div>
        <Button type="submit">{t("Search")}</Button>
        {query.search && (
          <Button asChild variant="ghost">
            <Link href="/app/drivers">{t("Clear search")}</Link>
          </Button>
        )}
      </form>

      {!result ? (
        <DriverCardSkeletons />
      ) : !data ? (
        <DriverReadError status={result.status} retry={retry} />
      ) : (
        <>
          {data.items.length === 0 ? (
            <section
              className="rounded-lg border border-border bg-surface px-5 py-10 text-center"
              aria-labelledby="driver-empty-title"
            >
              <h3 id="driver-empty-title" className="text-base font-semibold">
                {query.page > 1
                  ? t("No drivers on this page.")
                  : query.search
                    ? t("No drivers match your search.")
                    : t("No drivers yet.")}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {query.search
                  ? t("Try a different name or phone.")
                  : t("There are no drivers to display on this page.")}
              </p>
              {query.page > 1 && (
                <Button asChild variant="outline" className="mt-4">
                  <Link href={location(query.search)}>{t("Back to first page")}</Link>
                </Button>
              )}
            </section>
          ) : (
            <ul
              aria-label={t("Drivers")}
              className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {data.items.map((driver) => (
                <DriverCard
                  key={driver.id}
                  driver={driver}
                  onSelect={() => setSelected(driver.id)}
                />
              ))}
            </ul>
          )}
          <nav
            aria-label={t("Driver pagination")}
            className="mt-5 flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-sm text-muted-foreground">{t("Page {page}", { page: data.page.toLocaleString(locale) })}</p>
            <div className="flex gap-2">
              {data.page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link
                    aria-label={t("Previous")}
                    href={location(query.search, data.page - 1)}
                  >
                    {t("Previous")}
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={t("Previous")}
                  disabled
                >
                  {t("Previous")}
                </Button>
              )}
              {data.hasNext ? (
                <Button asChild variant="outline" size="sm">
                  <Link
                    aria-label={t("Next")}
                    href={location(query.search, data.page + 1)}
                  >
                    {t("Next")}
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={t("Next")}
                  disabled
                >
                  {t("Next")}
                </Button>
              )}
            </div>
          </nav>
        </>
      )}
      {selected && (
        <DriverDetails
          id={selected}
          scope={scope}
          onUpdated={retry}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
