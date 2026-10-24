const brands = {
  skoda: { name: "Škoda", src: "/vehicle-brands/skoda.svg" },
  "mercedes-benz": {
    name: "Mercedes-Benz",
    src: "/vehicle-brands/mercedes-benz.svg",
  },
  bmw: { name: "BMW", src: "/vehicle-brands/bmw.svg" },
  toyota: { name: "Toyota", src: "/vehicle-brands/toyota.svg" },
  hyundai: { name: "Hyundai", src: "/vehicle-brands/hyundai.svg" },
  volkswagen: { name: "Volkswagen", src: "/vehicle-brands/volkswagen.svg" },
} as const;

type BrandKey = keyof typeof brands;
const aliases: Readonly<Record<string, BrandKey>> = {
  skoda: "skoda",
  mercedes: "mercedes-benz",
  mercedesbenz: "mercedes-benz",
  bmw: "bmw",
  toyota: "toyota",
  hyundai: "hyundai",
  vw: "volkswagen",
  volkswagen: "volkswagen",
};

export function normalizeVehicleBrand(value?: string | null) {
  const normalized =
    value
      ?.normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") ?? "";
  const key = Object.hasOwn(aliases, normalized) ? aliases[normalized] : null;
  return key ? { key, ...brands[key] } : null;
}

export function vehicleTypeLabel(type?: string | null): string {
  switch (type?.toUpperCase()) {
    case "MOTORCYCLE":
      return "Motorcycle";
    case "BICYCLE":
      return "Bicycle";
    case "CAR":
      return "Car";
    case "VAN":
      return "Van";
    case "TRUCK":
      return "Truck";
    default:
      return "Vehicle";
  }
}

export function vehicleTypeTranslationKey(
  type?: string | null,
): "Motorcycle" | "Bicycle" | "Car" | "Van" | "Truck" | "Vehicle" {
  switch (type?.toUpperCase()) {
    case "MOTORCYCLE":
      return "Motorcycle";
    case "BICYCLE":
      return "Bicycle";
    case "CAR":
      return "Car";
    case "VAN":
      return "Van";
    case "TRUCK":
      return "Truck";
    default:
      return "Vehicle";
  }
}
