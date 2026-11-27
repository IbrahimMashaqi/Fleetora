"use client";

// Adapted from @shadcn/combobox, retrieved through shadcn MCP.
import { Combobox as Primitive } from "@base-ui/react/combobox";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";

export type ComboboxOption = { value: string; label: string; detail?: string };
type Props = {
  id: string;
  name?: string;
  label: string;
  placeholder: string;
  value: ComboboxOption | null;
  onChange: (value: ComboboxOption | null) => void;
  search: (query: string) => Promise<ComboboxOption[]>;
  required?: boolean;
  disabled?: boolean;
  locale?: "ar" | "en";
};

/** One editable field. Filtering is supplied by the server, never the current page. */
export function Combobox({
  id,
  name,
  label,
  placeholder,
  value,
  onChange,
  search,
  required,
  disabled,
  locale: language,
}: Props) {
  const { locale, t } = useLocale();
  const dir = (language ?? locale) === "ar" ? "rtl" : "ltr";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [items, setItems] = useState<ComboboxOption[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const generation = useRef(0);
  const hidden = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  useEffect(() => {
    input.current?.setCustomValidity(required && !value ? placeholder : "");
  }, [required, value, placeholder]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const current = ++generation.current;
    const timer = setTimeout(
      () => {
        void search(query)
          .then((result) => {
            if (!active || current !== generation.current) return;
            setItems(result.slice(0, query.trim() ? 20 : 10));
            setStatus("ready");
          })
          .catch(() => {
            if (active && current === generation.current) {
              setItems([]);
              setStatus("error");
            }
          });
      },
      query ? 250 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, query, search]);
  const choose = (option: ComboboxOption | null) => {
    setDraft(null);
    // Native form listeners (e.g. live price quote) must observe the chosen ID.
    if (hidden.current) {
      hidden.current.value = option?.value ?? "";
      hidden.current.dispatchEvent(new Event("input", { bubbles: true }));
      hidden.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
    onChange(option);
  };
  return (
    <Primitive.Root<ComboboxOption>
      items={items}
      value={value}
      inputValue={draft ?? value?.label ?? ""}
      filter={null}
      autoHighlight
      onValueChange={(option, details) => {
        if (details.reason === "input-change" || details.reason === "input-clear") return;
        choose(option);
      }}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next)
          setPortalContainer(
            anchor.current?.closest("dialog") ?? document.body,
          );
        if (next) {
          setStatus("loading");
          setItems([]);
        } else { setQuery(""); setDraft(null); }
      }}
      onInputValueChange={(text, details) => {
        if (details.reason === "input-change" || details.reason === "input-clear") {
          generation.current++;
          setDraft(text);
          setQuery(text);
          setStatus("loading");
          setItems([]);
        }
      }}
      isItemEqualToValue={(a, b) => a.value === b.value}
      required={required}
      disabled={disabled}
    >
      <input
        ref={hidden}
        type="hidden"
        name={name}
        value={value?.value ?? ""}
      />
      <div ref={anchor} className="relative min-w-0" dir={dir}>
        <Primitive.Input
          ref={input}
          id={id}
          aria-label={label}
          placeholder={placeholder}
          maxLength={100}
          onFocus={() => {
            if (!open) {
              setPortalContainer(
                anchor.current?.closest("dialog") ?? document.body,
              );
              setOpen(true);
              setQuery("");
              setStatus("loading");
            }
          }}
          className="min-h-10 w-full rounded-md border border-[var(--control-border)] bg-surface py-2 ps-3 pe-10 text-start text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
        />
        {value && (
          <Primitive.Clear
            aria-label={t("Clear selection")}
            className="absolute inset-y-0 end-0 flex w-10 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X aria-hidden className="size-4" />
          </Primitive.Clear>
        )}
      </div>
      <Primitive.Portal container={portalContainer}>
        <Primitive.Positioner sideOffset={4} className="z-[100]" align="start">
          <Primitive.Popup
            dir={dir}
            className="max-h-72 w-[var(--anchor-width)] overflow-y-auto rounded-md border bg-surface p-1 text-sm shadow-lg"
          >
            <div
              role="status"
              aria-live="polite"
              className="text-muted-foreground"
            >
              {status === "loading" && (
                <p className="p-3">{t("Loading operations...")}</p>
              )}
              {status === "error" && (
                <p className="p-3">
                  {t("Operations are temporarily unavailable. Try again.")}
                </p>
              )}
              {status === "ready" && items.length === 0 && (
                <p className="p-3">{t("No results")}</p>
              )}
            </div>
            <Primitive.List>
              {(option: ComboboxOption) => (
                <Primitive.Item
                  key={option.value}
                  value={option}
                  className="flex cursor-default items-center gap-2 rounded-sm px-3 py-2 text-start outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-words">{option.label}</span>
                    {option.detail && (
                      <bdi className="block text-xs text-muted-foreground">
                        {option.detail}
                      </bdi>
                    )}
                  </span>
                  <Primitive.ItemIndicator>
                    <Check aria-hidden className="size-4" />
                  </Primitive.ItemIndicator>
                </Primitive.Item>
              )}
            </Primitive.List>
          </Primitive.Popup>
        </Primitive.Positioner>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
