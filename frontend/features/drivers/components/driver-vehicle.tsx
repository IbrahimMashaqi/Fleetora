import { VehicleBrandLogo } from "@/components/vehicles/vehicle-brand-logo";
import { vehicleTypeTranslationKey } from "@/components/vehicles/vehicle-brands";
import { useLocale } from "@/lib/i18n";
import type { DriverVehicle } from "../drivers.types";

export function DriverVehicleSummary({
  vehicle,
}: {
  vehicle: DriverVehicle | null;
}) {
  const { t } = useLocale();
  const typeLabel = (type: NonNullable<DriverVehicle>["type"]) => t(vehicleTypeTranslationKey(type));
  return (
    <div className="flex min-w-0 items-center gap-3">
      <VehicleBrandLogo
        manufacturer={vehicle?.manufacturer}
        type={vehicle?.type}
      />
      <div className="min-w-0 flex-1 text-sm">
        {vehicle ? (
          <>
            <p className="font-semibold">
              {[vehicle.manufacturer, vehicle.model]
                .filter(Boolean)
                .join(" ") || typeLabel(vehicle.type)}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {vehicle.manufacturer
                ? typeLabel(vehicle.type)
                : t("Brand not recorded")}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("Plate")}{" "}
              <bdi className="ms-1 font-mono font-medium text-foreground [overflow-wrap:anywhere]">
                {vehicle.plateNumber.trim() || t("Not provided")}
              </bdi>
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">{t("No vehicle assigned")}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("Vehicle details will appear here.")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
