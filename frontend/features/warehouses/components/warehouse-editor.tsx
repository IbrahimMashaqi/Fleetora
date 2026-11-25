"use client";
import { useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withSessionLock } from "@/lib/auth/session-lock";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { writeWarehouseAction } from "../warehouses.action";
import {
  isValidWarehouseInput,
  normalizeWarehouseInput,
  type Warehouse,
  type WarehouseScope,
  type WarehouseWriteResult,
} from "../warehouses.types";

type Failure = Exclude<WarehouseWriteResult["status"], "saved">;
const shared = {
  invalid: "Check the warehouse name and address, then try again.",
  unavailable: "Warehouses could not be saved right now. Please try again.",
  unauthenticated: "Sign in again to continue.",
  forbidden: "Company administrator access is required.",
  changed: "Your session changed. Reload this page before continuing.",
  "not-found": "This warehouse is no longer available. Refresh the list.",
  uncertain:
    "We could not confirm whether the change was saved. Refresh to check before trying again.",
} as const satisfies Record<Exclude<Failure, "conflict">, TranslationKey>;

// A conflict means different things for an edit and an archive.
export function warehouseWriteMessage(
  status: Failure,
  kind: "save" | "archive",
): TranslationKey {
  if (status !== "conflict") return shared[status];
  return kind === "archive"
    ? "This warehouse has open pickup requests. Complete or cancel them before archiving."
    : "This warehouse was archived. Restore it before editing.";
}

export function WarehouseEditor({
  warehouse,
  scope,
  onClose,
  onSaved,
}: {
  warehouse: Warehouse | null;
  scope: WarehouseScope;
  onClose: () => void;
  onSaved: (warehouse: Warehouse) => void;
}) {
  const { t } = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<WarehouseWriteResult | null>(null);
  useEffect(() => {
    active.current = true;
    dialog.current?.showModal();
    nameInput.current?.focus();
    return () => {
      active.current = false;
    };
  }, []);
  const locked = pending || result?.status === "uncertain";

  async function submit(form: HTMLFormElement) {
    if (busy.current || result?.status === "uncertain") return;
    const data = new FormData(form);
    const input = normalizeWarehouseInput({
      name: String(data.get("name") ?? ""),
      address: String(data.get("address") ?? ""),
    });
    if (!isValidWarehouseInput(input)) {
      setResult({ status: "invalid" });
      return;
    }
    busy.current = true;
    setPending(true);
    setResult(null);
    try {
      const next = await withSessionLock(() =>
        writeWarehouseAction(
          scope,
          warehouse
            ? { kind: "edit", id: warehouse.id, input }
            : { kind: "create", input },
        ),
      );
      if (!active.current) return;
      if (next.status === "saved") onSaved(next.data);
      else setResult(next);
    } catch (error) {
      unstable_rethrow(error);
      if (active.current) setResult({ status: "uncertain" });
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }

  const invalid = result?.status === "invalid" || undefined;
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      aria-labelledby="warehouse-editor-title"
      aria-describedby="warehouse-editor-description"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 text-foreground shadow-lg backdrop:bg-sidebar-navy/55 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="warehouse-editor-title" className="text-lg font-semibold">
            {warehouse ? t("Edit warehouse") : t("Add warehouse")}
          </h2>
          <p
            id="warehouse-editor-description"
            className="mt-2 text-sm leading-6 text-muted-foreground"
          >
            {t(
              "Warehouses are the company locations where parcels are received and stored.",
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => dialog.current?.close()}
        >
          {t("Close")}
        </Button>
      </div>
      <form
        noValidate
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(event.currentTarget);
        }}
      >
        <fieldset disabled={locked} className="grid gap-5">
          <div className="space-y-2">
            <Label htmlFor="warehouse-name">{t("Warehouse name")}</Label>
            <Input
              id="warehouse-name"
              name="name"
              ref={nameInput}
              required
              minLength={2}
              maxLength={120}
              autoComplete="off"
              defaultValue={warehouse?.name ?? ""}
              aria-describedby="warehouse-name-hint"
              aria-invalid={invalid}
            />
            <p id="warehouse-name-hint" className="text-xs text-muted-foreground">
              {t("Use 2 to 120 characters.")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="warehouse-address">{t("Address")}</Label>
            <Input
              id="warehouse-address"
              name="address"
              required
              minLength={5}
              maxLength={300}
              autoComplete="off"
              defaultValue={warehouse?.address ?? ""}
              aria-describedby="warehouse-address-hint"
              aria-invalid={invalid}
            />
            <p
              id="warehouse-address-hint"
              className="text-xs text-muted-foreground"
            >
              {t("Use 5 to 300 characters.")}
            </p>
          </div>
        </fieldset>
        {result && result.status !== "saved" && (
          <p
            role="alert"
            className="rounded-md border border-danger/25 bg-danger-subtle p-3 text-sm text-foreground"
          >
            {t(warehouseWriteMessage(result.status, "save"))}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => dialog.current?.close()}
          >
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={locked}>
            {pending
              ? t("Saving...")
              : warehouse
                ? t("Save changes")
                : t("Add warehouse")}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
