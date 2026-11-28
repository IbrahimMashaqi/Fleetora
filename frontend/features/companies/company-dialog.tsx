"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n";
export function CompanyDialog({
  open,
  busy = false,
  onOpenChange,
  children,
  title,
  description,
}: {
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  title: string;
  description: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    { locale } = useLocale(),
    titleId = useId(),
    descriptionId = useId();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      onClose={() => onOpenChange(false)}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-surface p-5 text-foreground shadow-lg backdrop:bg-sidebar-navy/55 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => dialog.current?.close()}
        >
          {locale === "ar" ? "إغلاق" : "Close"}
        </Button>
      </div>
      <p id={descriptionId} className="text-sm text-muted-foreground">
        {description}
      </p>
      {children}
    </dialog>
  );
}
