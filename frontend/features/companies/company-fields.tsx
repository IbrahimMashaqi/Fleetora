"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/lib/i18n";
import type { Company } from "./company-contract";
export function CompanyFields({ company }: { company?: Company }) {
  const { locale } = useLocale(),
    c = (en: string, ar: string) => (locale === "ar" ? ar : en);
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="company-name">{c("Company name", "اسم الشركة")}</Label>
        <Input
          id="company-name"
          name="name"
          defaultValue={company?.name}
          minLength={2}
          maxLength={160}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="company-phone">
          {c("Company phone", "هاتف الشركة")}
        </Label>
        <Input
          id="company-phone"
          name="phone"
          type="tel"
          dir="ltr"
          defaultValue={company?.phone ?? ""}
          maxLength={40}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="company-address">
          {c("Company address", "عنوان الشركة")}
        </Label>
        <Input
          id="company-address"
          name="address"
          defaultValue={company?.address ?? ""}
          maxLength={500}
        />
      </div>
    </>
  );
}
export function basicCompanyInput(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    name: String(data.get("name") ?? "").trim(),
    phone: String(data.get("phone") ?? "").trim(),
    address: String(data.get("address") ?? "").trim(),
  };
}
