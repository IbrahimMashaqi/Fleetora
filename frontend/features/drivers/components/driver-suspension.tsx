"use client";
import { useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withSessionLock } from "@/lib/auth/session-lock";
import { useLocale } from "@/lib/i18n";
import { writeDriverAction } from "../drivers.action";
import type { Driver, DriverScope, DriverWriteResult } from "../drivers.types";
import { driverWriteMessages } from "./driver-editor";

export function DriverSuspension({
  driver,
  scope,
  onPending,
  onSaved,
}: {
  driver: Driver;
  scope: DriverScope;
  onPending: (value: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useLocale();
  const suspended = driver.status === "SUSPENDED";
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DriverWriteResult | null>(null);
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function save(next: boolean) {
    if (busy.current || result?.status === "uncertain" || (next && !reason.trim())) return;
    busy.current = true;
    setPending(true);
    onPending(true);
    setResult(null);
    try {
      const response = await withSessionLock(() =>
        writeDriverAction(scope, {
          kind: "suspension",
          id: driver.id,
          suspended: next,
          ...(next ? { reason: reason.trim() } : {}),
        }),
      );
      if (!active.current) return;
      if (response.status === "saved") {
        setConfirming(false);
        onSaved();
      } else setResult(response);
    } catch (error) {
      unstable_rethrow(error);
      if (active.current) setResult({ status: "uncertain" });
    } finally {
      busy.current = false;
      if (active.current) {
        setPending(false);
        onPending(false);
      }
    }
  }

  const locked = pending || result?.status === "uncertain";
  return (
    <section
      aria-labelledby="driver-suspension-title"
      className="space-y-3 border-t border-border pt-5"
    >
      <h3 id="driver-suspension-title" className="sr-only">
        {suspended ? t("Reactivate driver") : t("Suspend driver")}
      </h3>
      <p className="text-sm leading-6 text-muted-foreground">
        {suspended
          ? t("Reactivated drivers return as offline until they start work.")
          : t("Suspended drivers cannot receive new parcel assignments.")}
      </p>
      {confirming && !suspended ? (
        <div
          role="group"
          aria-labelledby="driver-suspend-confirm"
          className="space-y-3 rounded-md border border-danger-border bg-danger-background p-3"
        >
          <p id="driver-suspend-confirm" className="text-sm font-medium">
            {t(
              "Suspend {name}? They will not receive new parcel assignments until reactivated.",
              { name: driver.name },
            )}
          </p>
          <div className="space-y-2">
            <Label htmlFor="driver-suspension-reason">{t('Suspension reason')}</Label>
            <Input id="driver-suspension-reason" value={reason} onChange={event => setReason(event.target.value)} required maxLength={500} disabled={locked} autoFocus />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={locked || !reason.trim()}
              onClick={() => void save(true)}
            >
              {pending ? t("Suspending...") : t("Confirm suspension")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                setReason('');
                setResult(null);
              }}
            >
              {t("Keep active")}
            </Button>
          </div>
        </div>
      ) : suspended ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locked}
          onClick={() => void save(false)}
        >
          {pending ? t("Reactivating...") : t("Reactivate driver")}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-destructive"
          disabled={locked}
          onClick={() => setConfirming(true)}
        >
          {t("Suspend driver")}
        </Button>
      )}
      {result && result.status !== "saved" && (
        <p
          role="alert"
          className="rounded-md border border-danger/25 bg-danger-subtle p-3 text-sm text-foreground"
        >
          {t(driverWriteMessages[result.status])}
        </p>
      )}
    </section>
  );
}
