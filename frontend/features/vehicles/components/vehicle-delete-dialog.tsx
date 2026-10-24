"use client";

import { useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { withSessionLock } from "@/lib/auth/session-lock";
import { useLocale } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import { fleetAction } from "../vehicles.action";
import type { FleetResult, FleetScope, Vehicle } from "../vehicles.types";
import styles from "./vehicle-editor.module.css";

const messages = {
  invalid: "Fleet data is invalid. Refresh the page and try again.",
  unavailable: "Vehicle service is unavailable. Please try again later.",
  unauthenticated: "Your session has expired. Sign in again.",
  forbidden: "You are not allowed to manage vehicles for this company.",
  changed: "Your session or company changed. Reload before continuing.",
  "not-found": "The vehicle was not found or is no longer available to your company.",
  conflict: "Could not delete the vehicle because it is linked elsewhere. Refresh and try again.",
  uncertain: "We could not confirm the deletion. Close this dialog and refresh the list before retrying.",
} as const satisfies Record<
  Exclude<FleetResult["status"], "list" | "saved">,
  TranslationKey
>;

export function VehicleDeleteDialog({
  vehicle,
  scope,
  onClose,
  onDeleted,
}: {
  vehicle: Vehicle;
  scope: FleetScope;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { t } = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(true);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<FleetResult | null>(null);
  const blocked =
    result &&
    result.status !== "saved" &&
    result.status !== "list" &&
    result.status !== "invalid" &&
    result.status !== "unavailable";
  useEffect(() => {
    active.current = true;
    dialog.current?.showModal();
    return () => {
      active.current = false;
    };
  }, []);

  async function remove() {
    if (busy.current || blocked) return;
    busy.current = true;
    setPending(true);
    setResult(null);
    try {
      const next = await withSessionLock(() =>
        fleetAction(scope, { kind: "delete", id: vehicle.id }),
      );
      if (!active.current) return;
      if (next.status === "saved") {
        dialog.current?.close();
        onDeleted();
      } else setResult(next.status === "list" ? { status: "uncertain" } : next);
    } catch (error) {
      unstable_rethrow(error);
      if (active.current) setResult({ status: "uncertain" });
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="vehicle-delete-title"
      aria-describedby="vehicle-delete-description"
      aria-busy={pending}
      onClose={onClose}
      onCancel={(event) => {
        if (busy.current) event.preventDefault();
      }}
      className={`${styles.editor} fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-6 text-start text-foreground shadow-lg backdrop:bg-sidebar-navy/55`}
    >
      <h2 id="vehicle-delete-title" className="text-lg font-semibold">
        {t("Delete vehicle permanently?")}
      </h2>
      <div
        id="vehicle-delete-description"
        className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground"
      >
        <p>
          {t("The vehicle with plate")}{" "}
          <bdi className="font-mono font-semibold text-foreground">
            {vehicle.plateNumber}
          </bdi>{" "}
          {t("will be permanently deleted. This cannot be undone.")}
        </p>
        {vehicle.assignedDriver && (
          <p>
            {t("Assigned driver:")}{" "}
            <bdi className="font-semibold text-foreground">
              {vehicle.assignedDriver.name}
            </bdi>
            .
          </p>
        )}
        <p>
          {vehicle.assignedDriver
            ? t("The vehicle will be unassigned from the driver without deleting the driver.")
            : t("If the vehicle is assigned before deletion is confirmed, it will be unassigned without deleting the driver.")}
        </p>
      </div>
      {result && result.status !== "saved" && result.status !== "list" && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-danger/25 bg-danger-subtle p-3 text-sm leading-6"
        >
          {t(messages[result.status])}
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          autoFocus
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => dialog.current?.close()}
        >
          {t("Cancel")}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={pending || !!blocked}
          onClick={() => void remove()}
        >
          {pending ? t("Deleting...") : t("Delete permanently")}
        </Button>
      </div>
    </dialog>
  );
}
