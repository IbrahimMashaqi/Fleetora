"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/features/operations/components/operations-ui";
import { withSessionLock } from "@/lib/auth/session-lock";
import { useLocale } from "@/lib/i18n";
import { pricingArabic, pricingEnglish } from "./pricing-copy";
import { pricingAction } from "./pricing.action";
import type {
  PricingOperation,
  PricingResult,
  Scope,
} from "./pricing-contract";
export const controlStyle =
  "min-h-10 w-full rounded-md border border-input bg-surface px-3 py-2 text-start text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";
export function PricingField({
  name,
  label,
  value,
  money,
  required = true,
  maxLength = 150,
}: {
  name: string;
  label: string;
  value?: string;
  money?: boolean;
  required?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        defaultValue={value}
        required={required}
        maxLength={money ? 20 : maxLength}
        inputMode={money ? "decimal" : undefined}
        pattern={money ? "[0-9]{1,14}(\\.[0-9]{1,3})?" : undefined}
        dir={money ? "ltr" : undefined}
      />
    </div>
  );
}
export function PricingDialog({
  title,
  scope,
  children,
  operation,
  onClose,
  onSaved,
  confirm = false,
}: {
  title: string;
  scope: Scope;
  children: ReactNode;
  operation: (data: FormData) => PricingOperation | null;
  onClose: () => void;
  onSaved: () => void;
  confirm?: boolean;
}) {
  const { locale } = useLocale();
  const c = locale === "ar" ? pricingArabic : pricingEnglish;
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PricingResult | null>(null);
  useEffect(() => {
    mounted.current = true;
    const trigger = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      mounted.current = false;
      element?.close();
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-lg border bg-surface p-5 text-foreground shadow-lg backdrop:bg-sidebar-navy/55 sm:p-6"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <h2 id={titleId} className="mb-5 text-lg font-semibold">
        {title}
      </h2>
      <form
        className="space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending || result?.status === "uncertain") return;
          const next = operation(new FormData(event.currentTarget));
          if (!next) {
            setResult({ status: "invalid" });
            return;
          }
          setPending(true);
          setResult(null);
          try {
            const response = await withSessionLock(() =>
              pricingAction(scope, next),
            );
            if (!mounted.current) return;
            if (response.status === "saved") onSaved();
            else setResult(response);
          } catch (error) {
            unstable_rethrow(error);
            if (mounted.current) setResult({ status: "uncertain" });
          } finally {
            if (mounted.current) setPending(false);
          }
        }}
      >
        <fieldset
          disabled={pending || result?.status === "uncertain"}
          className="space-y-5"
        >
          {children}
          {confirm && (
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                required
                className="mt-1 size-4 accent-primary"
              />
              {c.confirmation}
            </label>
          )}
        </fieldset>
        <p className="text-xs leading-5 text-muted-foreground">{c.future}</p>
        {result && result.status !== "saved" && result.status !== "ready" && (
          <ErrorState status={result.status} />
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            {c.cancel}
          </Button>
          <Button
            type="submit"
            disabled={pending || result?.status === "uncertain"}
          >
            {pending ? c.saving : c.save}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
