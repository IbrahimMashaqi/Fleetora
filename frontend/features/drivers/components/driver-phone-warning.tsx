"use client";
import { useEffect, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { readClient } from "@/lib/api/read.client";
import { useLocale } from "@/lib/i18n";
import {
  driverPhonePattern,
  type DriverPhoneCheckResult,
  type DriverScope,
} from "../drivers.types";

export function DriverPhoneWarning({
  phone: submittedPhone,
  excludeId,
  scope,
}: {
  phone: string;
  excludeId?: string;
  scope: DriverScope;
}) {
  const { locale } = useLocale();
  const phone = submittedPhone.trim();
  const { userId, companyId } = scope;
  const key = JSON.stringify([userId, companyId, phone, excludeId]);
  const [reply, setReply] = useState<{
    key: string;
    result: DriverPhoneCheckResult;
  } | null>(null);
  const valid = phone.length <= 40 && driverPhonePattern.test(phone);
  useEffect(() => {
    if (!valid) return;
    let active = true;
    const timer = setTimeout(() => {
        readClient("driverPhone",
          { userId, companyId },
          { phone, ...(excludeId ? { excludeId } : {}) },
        )
        .then((result) => {
          if (active) setReply({ key, result });
        })
        .catch((error) => {
          unstable_rethrow(error);
          if (active) setReply({ key, result: { status: "unavailable" } });
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [valid, key, phone, excludeId, userId, companyId]);
  const result = reply?.key === key ? reply.result : null;
  const c = (en: string, ar: string) => (locale === "ar" ? ar : en);
  return (
    <p
      id="driver-phone-warning"
      role="status"
      className="text-sm text-muted-foreground"
    >
      {!valid
        ? ""
        : !result
          ? c(
              "Checking whether this phone is shared…",
              "التحقق من تكرار الرقم…",
            )
          : result.status !== "ready"
            ? c(
                "Could not check for a shared phone. Check the number before saving.",
                "تعذر التحقق من تكرار الرقم. تحقق منه قبل الحفظ.",
              )
            : result.duplicate
              ? c(
                  "Another driver in this company uses this phone. Check the number before saving.",
                  "يستخدم سائق آخر في هذه الشركة هذا الرقم. تحقق منه قبل الحفظ.",
                )
              : ""}
    </p>
  );
}
