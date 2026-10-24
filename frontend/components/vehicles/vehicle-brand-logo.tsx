"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n";
import {
  normalizeVehicleBrand,
  vehicleTypeTranslationKey,
} from "./vehicle-brands";

export function VehicleBrandLogo({
  manufacturer,
  type,
  className,
}: {
  manufacturer?: string | null;
  type?: string | null;
  className?: string;
}) {
  const { t } = useLocale();
  const brand = normalizeVehicleBrand(manufacturer);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const name = brand?.name ?? manufacturer?.trim();
  const vehicleType = t(vehicleTypeTranslationKey(type));
  const label = name
    ? t("Vehicle icon: {name}, {type}", { name, type: vehicleType })
    : t("Vehicle type icon: {type}", { type: vehicleType });
  return (
    <span
      className={cn(
        "inline-flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white p-2.5 text-brand-navy",
        className,
      )}
    >
      {brand && failedSource !== brand.src ? (
        <Image
          src={brand.src}
          alt={t("Vehicle brand logo: {name}", { name: brand.name })}
          width={56}
          height={56}
          unoptimized
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setFailedSource(brand.src)}
        />
      ) : (
        <VehicleTypeIcon type={type} label={label} />
      )}
    </span>
  );
}

function VehicleTypeIcon({
  type,
  label,
}: {
  type?: string | null;
  label: string;
}) {
  const kind = type?.toUpperCase();
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-8"
    >
      {kind === "BICYCLE" || kind === "MOTORCYCLE" ? (
        <>
          <circle cx="7" cy="23" r="4.5" />
          <circle cx="25" cy="23" r="4.5" />
          {kind === "BICYCLE" ? (
            <path d="m7 23 7-13 7 13H7l6-10h9m-10-3h5m8 13-5-17h-4" />
          ) : (
            <>
              <path d="m7 23 6-10h6l6 10M9 15h11l-5 8H7m11-16h4l3 7" />
              <path d="M11 11h6" />
            </>
          )}
        </>
      ) : kind === "CAR" ? (
        <>
          <path d="m5 14 3-7h16l3 7v11h-3v-4H8v4H5V14Zm0 0h22M9 17h2m10 0h2" />
        </>
      ) : kind === "VAN" || kind === "TRUCK" ? (
        <>
          <path
            d={
              kind === "TRUCK"
                ? "M3 7h17v15H3V7Zm17 5h5l4 6v4h-9"
                : "M3 8h19l7 9v6H3V8Zm15 0v15m4-12v6h7"
            }
          />
          <circle cx="9" cy="24" r="3" />
          <circle cx="24" cy="24" r="3" />
        </>
      ) : (
        <>
          <path d="M5 11h15l7 7v7H5V11Zm15 0v7h7M5 17h10" />
          <circle cx="10" cy="25" r="2.5" />
          <circle cx="23" cy="25" r="2.5" />
        </>
      )}
    </svg>
  );
}
