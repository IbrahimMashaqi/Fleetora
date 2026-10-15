"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProtectedSession } from "@/features/auth/session/session-context";
import { driverStatusLabels } from "../drivers.types";
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
          <h2 className="text-2xl font-semibold tracking-tight">Drivers</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Find and view the delivery drivers in your company.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!result}
          onClick={retry}
        >
          Refresh
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
          <Label htmlFor="driver-search">Search drivers</Label>
          <Input
            id="driver-search"
            type="search"
            name="search"
            maxLength={100}
            defaultValue={query.search}
            placeholder="Search by name or phone"
          />
        </div>
        <Button type="submit">Search</Button>
        {query.search && (
          <Button asChild variant="ghost">
            <Link href="/app/drivers">Clear search</Link>
          </Button>
        )}
      </form>

      {!result ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-border bg-surface p-6 text-sm text-muted-foreground"
        >
          Loading drivers...
        </div>
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
                  ? "No drivers on this page."
                  : query.search
                    ? "No drivers match your search."
                    : "No drivers yet."}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {query.search
                  ? "Try a different name or phone."
                  : "There are no drivers to display on this page."}
              </p>
              {query.page > 1 && (
                <Button asChild variant="outline" className="mt-4">
                  <Link href={location(query.search)}>Back to first page</Link>
                </Button>
              )}
            </section>
          ) : (
            <ul
              aria-label="Drivers"
              className="min-w-0 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
            >
              {data.items.map((driver) => (
                <li
                  key={driver.id}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 p-4 sm:p-5"
                >
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <p className="text-sm font-semibold leading-6 [overflow-wrap:anywhere]">
                      {driver.name || "Name not provided"}
                    </p>
                    <p className="mt-0.5 text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                      {driver.phone || "Phone not provided"}
                    </p>
                  </div>
                  <div className="col-start-1 row-start-2 flex min-w-0 flex-wrap gap-2">
                    <span
                      className={`rounded-md border px-2 py-1 text-xs font-medium ${driver.status === "ACTIVE" ? "border-success-border bg-success-background" : "border-border bg-muted"}`}
                    >
                      {driverStatusLabels[driver.status]}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`View ${driver.name || "driver"}`}
                    className="col-start-2 row-start-2 self-center sm:row-span-2 sm:row-start-1"
                    onClick={() => setSelected(driver.id)}
                  >
                    View details
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <nav
            aria-label="Driver pagination"
            className="mt-5 flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-sm text-muted-foreground">Page {data.page}</p>
            <div className="flex gap-2">
              {data.page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link
                    aria-label="Previous page"
                    href={location(query.search, data.page - 1)}
                  >
                    Previous
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Previous page"
                  disabled
                >
                  Previous
                </Button>
              )}
              {data.hasNext ? (
                <Button asChild variant="outline" size="sm">
                  <Link
                    aria-label="Next page"
                    href={location(query.search, data.page + 1)}
                  >
                    Next
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Next page"
                  disabled
                >
                  Next
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
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
