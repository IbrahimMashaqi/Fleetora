"use client";
import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { driverStatusLabels } from "../drivers.types";
import type { DriverRequest, DriverScope } from "../drivers.types";
import { useDriverRead } from "../use-driver-read";
import { DriverReadError } from "./driver-feedback";

export function DriverDetails({
  id,
  scope,
  onClose,
}: {
  id: string;
  scope: DriverScope;
  onClose: () => void;
}) {
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
      aria-labelledby="driver-details-title"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 text-foreground shadow-lg backdrop:bg-sidebar-navy/55 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id="driver-details-title" className="text-lg font-semibold">
          Driver details
        </h2>
        <Button
          type="button"
          autoFocus
          variant="ghost"
          size="sm"
          onClick={() => dialog.current?.close()}
        >
          Close details
        </Button>
      </div>
      <div className="mt-6">
        {!result ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading driver...
          </p>
        ) : driver ? (
          <dl className="space-y-5 text-sm">
            {[
              ["Name", driver.name || "Name not provided"],
              ["Phone", driver.phone || "Phone not provided"],
              ["Driver status", driverStatusLabels[driver.status]],
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
        ) : (
          <DriverReadError status={result.status} retry={retry} />
        )}
      </div>
    </dialog>
  );
}
