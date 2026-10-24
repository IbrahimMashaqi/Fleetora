"use client";
import { DriverAssignment } from "./driver-assignment";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DriverStatusBadge } from "./driver-status";
import { DriverVehicleSummary } from "./driver-vehicle";
import type { DriverRequest, DriverScope } from "../drivers.types";
import { useDriverRead } from "../use-driver-read";
import { DriverReadError } from "./driver-feedback";
import { useLocale } from "@/lib/i18n";

export function DriverDetails({
  id,
  scope,
  onClose,
  onUpdated,
}: {
  id: string;
  scope: DriverScope;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { t } = useLocale();
  const [pending, setPending] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useMemo<DriverRequest>(() => ({ kind: "detail", id }), [id]);
  const { result, retry } = useDriverRead(request, scope);
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  const driver = result?.status === "detail" ? result.data : null;
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      aria-labelledby="driver-details-title"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 text-foreground shadow-lg backdrop:bg-sidebar-navy/55 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id="driver-details-title" className="text-lg font-semibold">
          {t("Driver details")}
        </h2>
        <Button
          type="button"
          disabled={pending}
          autoFocus
          variant="ghost"
          size="sm"
          onClick={() => dialog.current?.close()}
        >
          {t("Close details")}
        </Button>
      </div>
      <div className="mt-6">
        {!result ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("Loading driver...")}
          </p>
        ) : driver ? (
          <div className="space-y-6">
            <dl className="grid gap-5 text-sm sm:grid-cols-2">
              {[
                [t("Name"), driver.name || t("Name not provided")],
                [t("Phone"), driver.phone || t("Phone not provided")],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-1 font-medium leading-6 [overflow-wrap:anywhere]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {t("Driver status")}
              </p>
              <DriverStatusBadge status={driver.status} />
            </div>
            <section
              className="rounded-lg border border-border bg-muted p-4"
              aria-labelledby="driver-vehicle-title"
            >
              <h3
                id="driver-vehicle-title"
                className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {t("Assigned vehicle")}
              </h3>
              <DriverVehicleSummary vehicle={driver.vehicle} />
              <DriverAssignment
                key={JSON.stringify(driver.vehicle)}
                driver={driver}
                scope={scope}
                onPending={setPending}
                onSaved={() => {
                  retry();
                  onUpdated();
                }}
              />
            </section>
          </div>
        ) : (
          <DriverReadError status={result.status} retry={retry} />
        )}
      </div>
    </dialog>
  );
}
