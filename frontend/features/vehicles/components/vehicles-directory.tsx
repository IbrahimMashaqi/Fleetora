"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VehicleBrandLogo } from "@/components/vehicles/vehicle-brand-logo";
import { vehicleTypeTranslationKey } from "@/components/vehicles/vehicle-brands";
import { useProtectedSession } from "@/features/auth/session/session-context";
import { DriverAccessDenied } from "@/features/drivers/components/driver-feedback";
import { DriverCardSkeletons } from "@/features/drivers/components/driver-card";
import type { DriverQuery } from "@/features/drivers/drivers.types";
import { useVehicles } from "../use-vehicles";
import {
  fleetMessages,
  type FleetScope,
  type Vehicle,
} from "../vehicles.types";
import { VehicleEditor } from "./vehicle-editor";
import { VehicleDeleteDialog } from "./vehicle-delete-dialog";
import { notifyVehicleChange } from "../vehicle-events";
import { useLocale } from "@/lib/i18n";
export function VehiclesDirectory({ query }: { query: DriverQuery }) {
  const { user } = useProtectedSession();
  const scope = useMemo(
    () => ({ userId: user.id, companyId: user.orgId ?? "" }),
    [user.id, user.orgId],
  );
  if (user.role !== "COMPANY_ADMIN" || !user.company || !user.orgId)
    return <DriverAccessDenied />;
  return (
    <VehicleCatalog
      key={JSON.stringify([scope, query])}
      scope={scope}
      query={query}
    />
  );
}
function location(search: string, page = 1) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (page !== 1) params.set("page", String(page));
  return `/app/vehicles${params.size ? `?${params}` : ""}`;
}
function VehicleCatalog({
  scope,
  query,
}: {
  scope: FleetScope;
  query: DriverQuery;
}) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const { result, retry } = useVehicles(scope, query.search, query.page);
  const [editor, setEditor] = useState<Vehicle | null | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState<Vehicle | null>(null);
  const [deleted, setDeleted] = useState(false);
  const data = result?.status === "list" ? result.data : null;
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight">{t("Vehicles")}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t("Your company fleet, ready for the road.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={!result}
            onClick={() => {
              setSaved(false);
              setDeleted(false);
              retry();
            }}
          >
            <RefreshCw aria-hidden="true" />
            {t("Refresh")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              setSaved(false);
              setEditor(null);
            }}
          >
            <Plus aria-hidden="true" />
            {t("Register vehicle")}
          </Button>
        </div>
      </div>
      {saved && (
        <p
          role="status"
          className="mt-5 flex items-start gap-2 rounded-md border border-success-border bg-success-background p-3 text-sm"
        >
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("Vehicle saved.")}
        </p>
      )}
      {deleted && (
        <p
          role="status"
          className="mt-5 flex items-start gap-2 rounded-md border border-success-border bg-success-background p-3 text-sm"
        >
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("Vehicle deleted successfully.")}
        </p>
      )}
      <form
        role="search"
        className="my-6 flex min-w-0 flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          router.push(
            location(
              String(
                new FormData(event.currentTarget).get("search") ?? "",
              ).trim(),
            ),
          );
        }}
      >
        <div className="min-w-0 flex-1 basis-56 space-y-2 sm:max-w-lg">
          <Label htmlFor="vehicle-search">{t("Search vehicles")}</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground"
            />
            <Input
              id="vehicle-search"
              name="search"
              type="search"
              maxLength={100}
              defaultValue={query.search}
              placeholder={t("Manufacturer, model or plate")}
              className="bg-surface ps-9"
            />
          </div>
        </div>
        <Button type="submit" variant="outline">
          {t("Search")}
        </Button>
        {query.search && (
          <Button asChild variant="ghost">
            <Link href="/app/vehicles">{t("Clear search")}</Link>
          </Button>
        )}
      </form>
      {!result ? (
        <DriverCardSkeletons label={t("Loading vehicles...")} />
      ) : !data ? (
        <div
          role="alert"
          className="rounded-lg border border-border bg-surface p-6"
        >
          <p className="flex items-start gap-3 text-sm leading-6">
            <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0 text-danger-foreground" />
            {result.status === "saved" || result.status === "list"
              ? t("Refresh to view vehicles.")
              : t(fleetMessages[result.status])}
          </p>
          {result.status === "unavailable" || result.status === "invalid" ? (
            <Button className="mt-4" variant="outline" onClick={retry}>
              {t("Try again")}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          {data.items.length === 0 ? (
            <section
              className="rounded-lg border border-border bg-surface px-6 py-12 text-center"
              aria-labelledby="vehicle-empty-title"
            >
              <h3 id="vehicle-empty-title" className="text-base font-semibold">
                {query.search
                  ? t("No vehicles match your search.")
                  : query.page > 1
                    ? t("No vehicles on this page.")
                    : t("Build your company fleet")}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {query.search
                  ? t("Try another manufacturer, model or plate.")
                  : t("Register a vehicle, then assign it from a driver's details.")}
              </p>
              {!query.search && query.page === 1 && (
                <Button
                  className="mt-5"
                  variant="outline"
                  onClick={() => setEditor(null)}
                >
                  {t("Register your first vehicle")}
                </Button>
              )}
            </section>
          ) : (
            <ul
              aria-label={t("Company vehicles")}
              className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {data.items.map((vehicle) => (
                <li
                  key={vehicle.id}
                  className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-strong focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 motion-reduce:transition-none"
                >
                  <div className="flex gap-3 p-5">
                    <VehicleBrandLogo
                      manufacturer={vehicle.manufacturer}
                      type={vehicle.type}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold leading-6 [overflow-wrap:anywhere]">
                        {[vehicle.manufacturer, vehicle.model]
                          .filter(Boolean)
                          .join(" ") || t(vehicleTypeTranslationKey(vehicle.type))}
                      </h3>
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">
                        {t(vehicleTypeTranslationKey(vehicle.type))}
                      </p>
                      <p className="mt-3 font-mono text-sm font-medium tabular-nums [overflow-wrap:anywhere]">
                        <bdi>
                          {vehicle.plateNumber.trim() || t("Plate not recorded")}
                        </bdi>
                      </p>
                    </div>
                  </div>
                  <div className="flex-1 border-y border-border bg-surface-secondary/60 px-5 py-4 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("Assigned driver")}
                    </span>
                    <p className="mt-1 font-medium [overflow-wrap:anywhere]">
                      {vehicle.assignedDriver?.name ?? t("Unassigned")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-10 min-w-0 flex-1 justify-between text-accent-foreground"
                      aria-label={t("Edit {name}", { name: vehicle.plateNumber })}
                      onClick={() => setEditor(vehicle)}
                    >
                      {t("Edit vehicle")}
                      <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-10 w-10 shrink-0 border-s border-border px-0 text-danger-foreground hover:bg-danger-background hover:text-danger-foreground"
                      aria-label={t("Delete vehicle {plate}", { plate: vehicle.plateNumber })}
                      title={t("Delete vehicle")}
                      onClick={() => {
                        setSaved(false);
                        setDeleted(false);
                        setDeleting(vehicle);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <nav
            aria-label={t("Vehicle pagination")}
            className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
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
                <Button variant="outline" size="sm" disabled>
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
                <Button variant="outline" size="sm" disabled>
                  {t("Next")}
                </Button>
              )}
            </div>
          </nav>
        </>
      )}
      {editor !== undefined && (
        <VehicleEditor
          catalog={data?.catalog ?? []}
          scope={scope}
          vehicle={editor}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            setSaved(true);
            retry();
          }}
        />
      )}
      {deleting && (
        <VehicleDeleteDialog
          vehicle={deleting}
          scope={scope}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setDeleted(true);
            notifyVehicleChange(scope);
          }}
        />
      )}
    </div>
  );
}
