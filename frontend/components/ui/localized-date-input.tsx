"use client";
import { useState } from "react";
import { Input } from "./input";
import { useLocale } from "@/lib/i18n";

function parseArabicDate(value: string) {
  const digits = value.replace(/[٠-٩]/g, (d) =>
    String("٠١٢٣٤٥٦٧٨٩".indexOf(d)),
  );
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(digits)) return "";
  const [day, month, year] = digits.split("/");
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === iso
    ? iso
    : "";
}

export function LocalizedDateInput({
  id,
  name,
  defaultValue = "",
}: {
  id: string;
  name: string;
  defaultValue?: string;
}) {
  const { locale } = useLocale();
  const [value, setValue] = useState(() =>
    defaultValue
      ? defaultValue
          .split("-")
          .reverse()
          .join("/")
          .replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)])
      : "",
  );
  const iso = parseArabicDate(value),
    valid = !value || Boolean(iso);
  if (locale !== "ar")
    return (
      <Input id={id} name={name} type="date" defaultValue={defaultValue} />
    );
  return (
    <>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        dir="rtl"
        placeholder="يوم/شهر/سنة"
        value={value}
        aria-invalid={!valid}
        maxLength={10}
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          event.target.setCustomValidity(
            !next || parseArabicDate(next)
              ? ""
              : "أدخل تاريخًا صحيحًا بصيغة يوم/شهر/سنة",
          );
        }}
        onBlur={(event) =>
          event.target.setCustomValidity(
            valid ? "" : "أدخل تاريخًا صحيحًا بصيغة يوم/شهر/سنة",
          )
        }
        onInvalid={(event) =>
          event.currentTarget.setCustomValidity(
            "أدخل تاريخًا صحيحًا بصيغة يوم/شهر/سنة",
          )
        }
      />
      <input type="hidden" name={name} value={valid ? iso : ""} />
    </>
  );
}
