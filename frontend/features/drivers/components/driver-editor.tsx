"use client";
import { useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withSessionLock } from "@/lib/auth/session-lock";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { writeDriverAction } from "../drivers.action";
import { DriverPhoneWarning } from "./driver-phone-warning";
import {
  isValidDriverInput,
  normalizeDriverInput,
  type Driver,
  type DriverScope,
  type DriverWriteResult,
} from "../drivers.types";

export const driverWriteMessages = {
  conflict: "Revoke login access before changing a linked phone, then reissue the driver invitation.",
  invalid: "Check the driver name and phone number, then try again.",
  unavailable: "Drivers could not be saved right now. Please try again.",
  unauthenticated: "Sign in again to continue.",
  forbidden: "Company administrator access is required.",
  changed: "Your session changed. Reload this page before continuing.",
  "not-found": "This driver is no longer available. Refresh the list.",
  uncertain:
    "We could not confirm whether the change was saved. Refresh to check before trying again.",
} as const satisfies Record<
  Exclude<DriverWriteResult["status"], "saved">,
  TranslationKey
>;

export function DriverEditor({
  driver,
  scope,
  onClose,
  onSaved,
}: {
  driver: Driver | null;
  scope: DriverScope;
  onClose: () => void;
  onSaved: (driver: Driver) => void;
}) {
  const { t } = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DriverWriteResult | null>(null);
  const [phone, setPhone] = useState(driver?.phone ?? "");
  useEffect(() => {
    active.current = true;
    dialog.current?.showModal();
    // showModal() moves focus to the first focusable control; start on the form.
    nameInput.current?.focus();
    return () => {
      active.current = false;
    };
  }, []);
  const locked = pending || result?.status === "uncertain";

  async function submit(form: HTMLFormElement) {
    if (busy.current || result?.status === "uncertain") return;
    const data = new FormData(form);
    const input = normalizeDriverInput({
      name: String(data.get("name") ?? ""),
      phone: String(data.get("phone") ?? ""),
    });
    if (!isValidDriverInput(input)) {
      setResult({ status: "invalid" });
      return;
    }
    busy.current = true;
    setPending(true);
    setResult(null);
    try {
      const next = await withSessionLock(() =>
        writeDriverAction(
          scope,
          driver
            ? { kind: "edit", id: driver.id, input }
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

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      aria-labelledby="driver-editor-title"
      aria-describedby="driver-editor-description"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 text-foreground shadow-lg backdrop:bg-sidebar-navy/55 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="driver-editor-title" className="text-lg font-semibold">
            {driver ? t("Edit driver") : t("Add driver")}
          </h2>
          <p
            id="driver-editor-description"
            className="mt-2 text-sm leading-6 text-muted-foreground"
          >
            {t(
              "Driver records hold contact details only. Driver app sign-in is set up separately.",
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
            <Label htmlFor="driver-name">{t("Full name")}</Label>
            <Input
              id="driver-name"
              name="name"
              ref={nameInput}
              required
              minLength={2}
              maxLength={150}
              autoComplete="off"
              defaultValue={driver?.name ?? ""}
              aria-describedby="driver-name-hint"
              aria-invalid={result?.status === "invalid" || undefined}
            />
            <p id="driver-name-hint" className="text-xs text-muted-foreground">
              {t("Use 2 to 150 characters.")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="driver-phone">{t("Phone number")}</Label>
            <Input
              id="driver-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              required
              maxLength={40}
              autoComplete="off"
              value={phone}
              onChange={event => setPhone(event.target.value)}
              placeholder="+970 59 000 0000"
              aria-describedby="driver-phone-hint driver-phone-warning"
              aria-invalid={result?.status === "invalid" || undefined}
            />
            <p id="driver-phone-hint" className="text-xs text-muted-foreground">
              {t(
                "Use digits, spaces, dashes, or parentheses, with an optional leading +.",
              )}
            </p>
            <DriverPhoneWarning phone={phone} excludeId={driver?.id} scope={scope} />
          </div>
        </fieldset>
        {result && result.status !== "saved" && (
          <p
            role="alert"
            className="rounded-md border border-danger/25 bg-danger-subtle p-3 text-sm text-foreground"
          >
            {t(driverWriteMessages[result.status])}
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
              : driver
                ? t("Save changes")
                : t("Add driver")}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
