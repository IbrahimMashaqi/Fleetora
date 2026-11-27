"use client";
import { useDebouncedSearch } from "@/lib/use-debounced-search";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CircleAlert, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProtectedSession } from "@/features/auth/session/session-context";
import { DriverAccessDenied } from "@/features/drivers/components/driver-feedback";
import { useLocale } from "@/lib/i18n";
import { useWarehouseRead } from "../use-warehouse-read";
import type {
  Warehouse,
  WarehouseQuery,
  WarehouseResult,
  WarehouseScope,
  WarehouseStatus,
} from "../warehouses.types";
import { WarehouseCard, WarehouseCardSkeletons } from "./warehouse-card";
import { WarehouseEditor } from "./warehouse-editor";

function location(status: WarehouseStatus, search: string, page = 1) {
  const params = new URLSearchParams();
  if (status === "ARCHIVED") params.set("status", "archived");
  if (search) params.set("search", search);
  if (page !== 1) params.set("page", String(page));
  return `/app/warehouses${params.size ? `?${params}` : ""}`;
}

export function WarehousesDirectory({ query }: { query: WarehouseQuery }) {
  const { user } = useProtectedSession();
  if (user.role !== "COMPANY_ADMIN" || !user.company || !user.orgId)
    return <DriverAccessDenied />;
  return (
    <WarehouseList
      key={JSON.stringify([user.id, user.orgId, query])}
      scope={{ userId: user.id, companyId: user.orgId }}
      query={query}
    />
  );
}

function WarehouseList({
  scope,
  query: initialQuery,
}: {
  scope: WarehouseScope;
  query: WarehouseQuery;
}) {
  const { locale, t } = useLocale();
  const searchState = useDebouncedSearch(initialQuery.search);
  const query = useMemo(() => ({ ...initialQuery, search: searchState.search, page: searchState.search === initialQuery.search ? initialQuery.page : 1 }), [initialQuery, searchState.search]);
  const { result, retry } = useWarehouseRead(query, scope);
  const [editing, setEditing] = useState<Warehouse | "new" | null>(null);
  const [saved, setSaved] = useState(false);
  const data = result?.status === "list" ? result.data : null;
  const archived = query.status === "ARCHIVED";
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("Warehouses")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t("Find, add, and manage your company's warehouses.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" disabled={!result} onClick={retry}>
            <RefreshCw aria-hidden="true" />
            {t("Refresh")}
          </Button>
          <Button type="button" onClick={() => setEditing("new")}>
            <Plus aria-hidden="true" />
            {t("Add warehouse")}
          </Button>
        </div>
      </div>

      {saved && (
        <p
          role="status"
          className="mt-4 rounded-md border border-success-border bg-success-subtle p-3 text-sm"
        >
          {t("Warehouse changes saved.")}
        </p>
      )}
      <nav
        aria-label={t("Warehouse status")}
        className="mt-6 inline-flex rounded-lg border border-border bg-surface p-1"
      >
        {(["ACTIVE", "ARCHIVED"] as const).map((status) => (
          <Link
            key={status}
            href={location(status, query.search)}
            aria-current={query.status === status ? "page" : undefined}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 aria-[current=page]:bg-surface-secondary aria-[current=page]:text-foreground motion-reduce:transition-none"
          >
            {status === "ACTIVE" ? t("Active") : t("Archived")}
          </Link>
        ))}
      </nav>

      <form
        role="search"
        className="my-6 flex min-w-0 flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
        onSubmit={(event) => { event.preventDefault(); searchState.apply(); }}
      >
        <div className="min-w-0 flex-1 basis-56 space-y-2 sm:max-w-lg">
          <Label htmlFor="warehouse-search">{t("Search warehouses")}</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground"
            />
            <Input
              id="warehouse-search"
              type="search"
              name="search"
              maxLength={100}
              value={searchState.text} onChange={event => searchState.setText(event.target.value)}
              placeholder={t("Search by name or address")}
              className="bg-surface ps-9"
            />
          </div>
        </div>
        <Button type="submit" variant="outline">
          {t("Search")}
        </Button>
        {query.search && (
          <Button asChild variant="ghost">
            <Link href={location(query.status, "")}>{t("Clear search")}</Link>
          </Button>
        )}
      </form>

      {!result ? (
        <WarehouseCardSkeletons label={t("Loading warehouses...")} />
      ) : !data ? (
        <WarehouseReadError status={result.status} retry={retry} />
      ) : (
        <>
          {data.items.length === 0 ? (
            <section
              className="rounded-lg border border-border bg-surface px-5 py-12 text-center"
              aria-labelledby="warehouse-empty-title"
            >
              <h3 id="warehouse-empty-title" className="text-base font-semibold">
                {query.page > 1
                  ? t("No warehouses on this page.")
                  : query.search
                    ? t("No warehouses match your search.")
                    : archived
                      ? t("No archived warehouses.")
                      : t("No warehouses yet.")}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {query.search
                  ? t("Try a different name or address.")
                  : query.page > 1
                    ? t("There are no warehouses to display on this page.")
                    : archived
                      ? t("Archived warehouses appear here and can be restored at any time.")
                      : t("Add your first warehouse to start receiving parcels at your locations.")}
              </p>
              {!query.search && query.page === 1 && !archived && (
                <Button
                  type="button"
                  className="mt-4"
                  onClick={() => setEditing("new")}
                >
                  <Plus aria-hidden="true" />
                  {t("Add warehouse")}
                </Button>
              )}
              {query.page > 1 && (
                <Button asChild variant="outline" className="mt-4">
                  <Link href={location(query.status, query.search)}>
                    {t("Back to first page")}
                  </Link>
                </Button>
              )}
            </section>
          ) : (
            <ul
              aria-label={t("Warehouses")}
              className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {data.items.map((warehouse) => (
                <WarehouseCard
                  key={warehouse.id}
                  warehouse={warehouse}
                  scope={scope}
                  onEdit={() => setEditing(warehouse)}
                  onChanged={() => {
                    setSaved(true);
                    retry();
                  }}
                />
              ))}
            </ul>
          )}
          <nav
            aria-label={t("Warehouse pagination")}
            className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
          >
            <p className="text-sm text-muted-foreground">
              {t("Page {page}", { page: data.page.toLocaleString(locale) })}
            </p>
            <div className="flex gap-2">
              {data.page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={location(query.status, query.search, data.page - 1)}>
                    {t("Previous")}
                  </Link>
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled>
                  {t("Previous")}
                </Button>
              )}
              {data.hasNext ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={location(query.status, query.search, data.page + 1)}>
                    {t("Next")}
                  </Link>
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled>
                  {t("Next")}
                </Button>
              )}
            </div>
          </nav>
        </>
      )}
      {editing && (
        <WarehouseEditor
          warehouse={editing === "new" ? null : editing}
          scope={scope}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setSaved(true);
            setEditing(null);
            retry();
          }}
        />
      )}
    </div>
  );
}

function WarehouseReadError({
  status,
  retry,
}: {
  status: WarehouseResult["status"];
  retry: () => void;
}) {
  const { t } = useLocale();
  if (status === "forbidden") return <DriverAccessDenied />;
  const message =
    status === "invalid"
      ? t("Check the search and page values, then try again.")
      : status === "changed"
        ? t("Your session changed. Reload this page to continue.")
        : t("We couldn’t load warehouses. Please try again.");
  return (
    <div className="rounded-lg border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <CircleAlert
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 text-danger-foreground"
        />
        <p role="alert" className="text-sm leading-6">
          {message}
        </p>
      </div>
      {status === "unavailable" && (
        <Button type="button" variant="outline" className="mt-4" onClick={retry}>
          {t("Try again")}
        </Button>
      )}
      {status === "changed" && (
        <Button asChild variant="outline" className="mt-4">
          <a href="/app/warehouses">{t("Reload directory")}</a>
        </Button>
      )}
      {status === "invalid" && (
        <Button asChild variant="outline" className="mt-4">
          <Link href="/app/warehouses">{t("Reset search")}</Link>
        </Button>
      )}
    </div>
  );
}
