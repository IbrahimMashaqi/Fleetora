"use client";
import { useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { Archive, ArchiveRestore, MapPin, Pencil, Warehouse as WarehouseIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withSessionLock } from "@/lib/auth/session-lock";
import { useLocale } from "@/lib/i18n";
import { writeWarehouseAction } from "../warehouses.action";
import type {
  Warehouse,
  WarehouseScope,
  WarehouseWriteResult,
} from "../warehouses.types";
import { warehouseWriteMessage } from "./warehouse-editor";

export function WarehouseCard({
  warehouse,
  scope,
  onEdit,
  onChanged,
}: {
  warehouse: Warehouse;
  scope: WarehouseScope;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const { t } = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<WarehouseWriteResult | null>(null);
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function save(archived: boolean) {
    if (busy.current || result?.status === "uncertain") return;
    busy.current = true;
    setPending(true);
    setResult(null);
    try {
      const response = await withSessionLock(() =>
        writeWarehouseAction(scope, {
          kind: "archive",
          id: warehouse.id,
          archived,
        }),
      );
      if (!active.current) return;
      if (response.status === "saved") {
        setConfirming(false);
        onChanged();
      } else setResult(response);
    } catch (error) {
      unstable_rethrow(error);
      if (active.current) setResult({ status: "uncertain" });
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }

  const locked = pending || result?.status === "uncertain";
  const titleId = `warehouse-${warehouse.id}`;
  const confirmId = `warehouse-${warehouse.id}-confirm`;
  return (
    <li className="min-w-0">
      <article
        aria-labelledby={titleId}
        className="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-strong focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 motion-reduce:transition-none"
      >
        <div className="flex flex-1 items-start gap-3 p-5">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface-secondary text-muted-foreground"
          >
            <WarehouseIcon className="size-5" strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1">
            <h3
              id={titleId}
              className="text-base font-semibold leading-6 [overflow-wrap:anywhere]"
            >
              <bdi>{warehouse.name}</bdi>
            </h3>
            <p className="mt-1 flex items-start gap-1.5 text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
              <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <bdi>{warehouse.address}</bdi>
            </p>
            {warehouse.archived && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <Archive aria-hidden="true" className="size-3.5" />
                {t("Archived")}
              </p>
            )}
          </div>
        </div>
        {confirming && !warehouse.archived && (
          <div
            role="group"
            aria-labelledby={confirmId}
            className="mx-3 mb-3 space-y-3 rounded-md border border-danger-border bg-danger-background p-3"
          >
            <p id={confirmId} className="text-sm font-medium">
              {t(
                "Archive {name}? It stays in your history but cannot be used for new pickup requests.",
                { name: warehouse.name },
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                autoFocus
                disabled={locked}
                onClick={() => void save(true)}
              >
                {pending ? t("Archiving...") : t("Confirm archive")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setConfirming(false);
                  setResult(null);
                }}
              >
                {t("Keep warehouse")}
              </Button>
            </div>
          </div>
        )}
        {result && result.status !== "saved" && (
          <p
            role="alert"
            className="mx-3 mb-3 rounded-md border border-danger/25 bg-danger-subtle p-3 text-sm text-foreground"
          >
            {t(warehouseWriteMessage(result.status, "archive"))}
          </p>
        )}
        <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
          {warehouse.archived ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t("Restore {name}", { name: warehouse.name })}
              disabled={locked}
              onClick={() => void save(false)}
            >
              <ArchiveRestore aria-hidden="true" />
              {pending ? t("Restoring...") : t("Restore")}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t("Edit {name}", { name: warehouse.name })}
                disabled={locked}
                onClick={onEdit}
              >
                <Pencil aria-hidden="true" />
                {t("Edit")}
              </Button>
              {!confirming && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  aria-label={t("Archive {name}", { name: warehouse.name })}
                  disabled={locked}
                  onClick={() => setConfirming(true)}
                >
                  <Archive aria-hidden="true" />
                  {t("Archive")}
                </Button>
              )}
            </>
          )}
        </div>
      </article>
    </li>
  );
}

export function WarehouseCardSkeletons({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-lg border border-border bg-surface motion-safe:animate-pulse"
          >
            <div className="flex gap-3 p-5">
              <div className="size-10 shrink-0 rounded-full bg-muted" />
              <div className="flex-1 space-y-3">
                <div className="h-5 w-3/4 rounded bg-muted" />
                <div className="h-4 w-full rounded bg-muted" />
              </div>
            </div>
            <div className="border-t border-border p-3">
              <div className="h-7 w-32 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
