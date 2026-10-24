"use client";
import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/lib/i18n";
import { catalogKey } from "../vehicle-catalog";

type Option = { value: string; label: string; keywords?: readonly string[] };
export function SearchableSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const filtered = options.filter((option) =>
    [option.label, ...(option.keywords ?? [])].some((term) =>
      catalogKey(term).includes(catalogKey(query)),
    ),
  );
  function close() {
    setOpen(false);
    setQuery("");
    trigger.current?.focus();
  }
  function choose(option: Option) {
    onChange(option.value);
    close();
  }
  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          setActive(0);
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActive(0);
            setOpen(true);
          }
        }}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-surface px-3 py-2 text-start text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="min-w-0 break-words">
          {options.find((option) => option.value === value)?.label ??
            t("Not recorded")}
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && !disabled && (
        <div
          className="absolute z-20 mt-1 w-full min-w-0 rounded-md border border-border bg-surface p-2 shadow-lg"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) =>
                filtered.length
                  ? (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      filtered.length) %
                    filtered.length
                  : 0,
              );
            }
            if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              setActive(
                event.key === "Home" ? 0 : Math.max(0, filtered.length - 1),
              );
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (filtered[active]) choose(filtered[active]);
            }
          }}
        >
          <Input
            autoFocus
            aria-label={t("Search {label}", { label: label.toLocaleLowerCase() })}
            role="searchbox"
            placeholder={t("Search")}
            aria-controls={`${id}-options`}
            aria-activedescendant={
              filtered[active] ? `${id}-option-${active}` : undefined
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
          />
          <ul
            id={`${id}-options`}
            role="listbox"
            aria-label={t("{label} options", { label })}
            className="mt-2 max-h-44 overflow-y-auto"
          >
            {filtered.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={value === option.value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                onMouseMove={() => setActive(index)}
                ref={(element) => {
                  if (index === active)
                    element?.scrollIntoView({ block: "nearest" });
                }}
                className={`cursor-pointer rounded px-2 py-2 text-sm ${active === index ? "bg-primary-subtle text-accent-foreground" : "text-foreground"}`}
              >
                {option.label}
                {value === option.value && <span aria-hidden="true"> ✓</span>}
              </li>
            ))}
          </ul>
          {!filtered.length && (
            <p role="status" className="p-2 text-sm text-muted-foreground">
              {t("No matches. Clear search to choose Other / Custom.")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
