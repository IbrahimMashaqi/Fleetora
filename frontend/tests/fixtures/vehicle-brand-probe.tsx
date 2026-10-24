import { VehicleBrandLogo } from "@/components/vehicles/vehicle-brand-logo";
import { normalizeVehicleBrand } from "@/components/vehicles/vehicle-brands";

// Test-only composition: the isolated harness creates this route in its temp copy.
// Production driver data never supplies these fictional brand assignments.
export default function VehicleBrandProbe() {
  const brands = [
    "Škoda",
    "MERCEDES BENZ",
    "B.M.W.",
    "Toyota",
    "Hyundai",
    "VW",
  ];
  return (
    <main className="min-h-svh bg-background p-6 text-foreground">
      <h1 className="text-2xl font-semibold">
        Vehicle identity component verification
      </h1>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {brands.map((brand) => (
          <section
            key={brand}
            className="flex items-center gap-4 rounded-lg border border-border bg-surface p-5"
          >
            <VehicleBrandLogo manufacturer={brand} type="CAR" />
            <h2 className="text-base font-semibold">
              {normalizeVehicleBrand(brand)?.name}
            </h2>
          </section>
        ))}
        {["MOTORCYCLE", "BICYCLE", "CAR", "VAN", "TRUCK", "UNKNOWN"].map(
          (type) => (
            <section
              key={type}
              className="flex items-center gap-4 rounded-lg border border-border bg-surface p-5"
            >
              <VehicleBrandLogo type={type} />
              <h2 className="text-sm font-semibold">{type}</h2>
            </section>
          ),
        )}
        <VehicleBrandLogo manufacturer="Unlisted Motors" type="CAR" />
      </div>
    </main>
  );
}
