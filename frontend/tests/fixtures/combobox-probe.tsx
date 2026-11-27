"use client";
import { useCallback, useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { LocalizedDateInput } from "@/components/ui/localized-date-input";

export default function ComboboxProbe() {
  const [value, setValue] = useState<ComboboxOption | null>(null);
  const [queries, setQueries] = useState<string[]>([]);
  const modal = useRef<HTMLDialogElement>(null);
  const search = useCallback(async (query: string) => {
    setQueries((previous) => [...previous, query]);
    await new Promise((resolve) =>
      setTimeout(resolve, query === "slow" ? 650 : 40),
    );
    return query === "none"
      ? []
      : Array.from({ length: query ? 20 : 10 }, (_, i) => ({
          value: String(i),
          label: `${query || "أحمد"} ${i + 1}`,
        }));
  }, []);
  return (
    <main dir="rtl" className="p-8">
      <form onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="merchant">التاجر</label>
        <Combobox
          id="merchant"
          name="merchantId"
          label="التاجر"
          placeholder="اختر التاجر"
          value={value}
          onChange={setValue}
          search={search}
          locale="ar"
        />
        <output data-testid="selected">{value?.value ?? "empty"}</output>
        <output data-testid="queries">{JSON.stringify(queries)}</output>
        <label htmlFor="from">من تاريخ</label>
        <LocalizedDateInput id="from" name="from" defaultValue="2026-11-27" />
      </form>
      <button onClick={() => modal.current?.showModal()}>Open dialog</button>
      <dialog ref={modal}>
        <Combobox
          id="modal-merchant"
          label="تاجر النافذة"
          placeholder="اختر التاجر"
          value={value}
          onChange={setValue}
          search={search}
        />
      </dialog>
    </main>
  );
}
