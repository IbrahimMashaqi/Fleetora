export type VehicleCatalogBrand = {
  manufacturer: string;
  aliases: readonly string[];
  models: readonly string[];
};

// Curated choices, not a global registry. Unknown brands/models remain valid.
// This is also returned by GET /vehicles so forms use the same source of truth.
export const vehicleCatalog: readonly VehicleCatalogBrand[] = [
  {
    manufacturer: '\u0160koda',
    aliases: ['skoda'],
    models: ['Octavia', 'Superb', 'Fabia', 'Kodiaq', 'Kamiq', 'Karoq'],
  },
  {
    manufacturer: 'Mercedes-Benz',
    aliases: ['mercedes'],
    models: ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'Sprinter', 'Vito'],
  },
  {
    manufacturer: 'BMW',
    aliases: [],
    models: ['1 Series', '3 Series', '5 Series', 'X1', 'X3', 'X5'],
  },
  {
    manufacturer: 'Toyota',
    aliases: [],
    models: ['Yaris', 'Corolla', 'Camry', 'RAV4', 'Hilux'],
  },
  {
    manufacturer: 'Hyundai',
    aliases: [],
    models: ['i10', 'i20', 'Accent', 'Elantra', 'Tucson'],
  },
  {
    manufacturer: 'Volkswagen',
    aliases: ['vw'],
    models: ['Polo', 'Golf', 'Passat', 'Tiguan', 'Caddy'],
  },
  {
    manufacturer: 'Ford',
    aliases: [],
    models: ['Fiesta', 'Focus', 'Transit', 'Ranger'],
  },
  {
    manufacturer: 'Renault',
    aliases: [],
    models: ['Clio', 'Megane', 'Kangoo', 'Master'],
  },
  {
    manufacturer: 'Nissan',
    aliases: [],
    models: ['Micra', 'Qashqai', 'Juke', 'Navara'],
  },
];

export function catalogKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
export function normalizeManufacturer(value: string): string {
  const key = catalogKey(value);
  return (
    vehicleCatalog.find((brand) =>
      [brand.manufacturer, ...brand.aliases].some(
        (alias) => catalogKey(alias) === key,
      ),
    )?.manufacturer ?? value.trim()
  );
}
export function validCatalogPair(
  manufacturer: string | null | undefined,
  model: string | null | undefined,
): boolean {
  if (!manufacturer || !model) return true;
  const brand = vehicleCatalog.find(
    (entry) => entry.manufacturer === normalizeManufacturer(manufacturer),
  );
  if (!brand) return true;
  const key = catalogKey(model);
  return (
    brand.models.some((entry) => catalogKey(entry) === key) ||
    !vehicleCatalog.some((entry) =>
      entry.models.some((name) => catalogKey(name) === key),
    )
  );
}
