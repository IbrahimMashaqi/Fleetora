export type VehicleCatalog = ReadonlyArray<{
  manufacturer: string;
  aliases: readonly string[];
  models: readonly string[];
}>;

export function catalogKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
export function findManufacturer(catalog: VehicleCatalog, value: string) {
  return catalog.find((brand) =>
    [brand.manufacturer, ...brand.aliases].some(
      (alias) => catalogKey(alias) === catalogKey(value),
    ),
  );
}

// Allowlist the catalog supplied by the existing authenticated directory API.
export function parseCatalog(value: unknown): VehicleCatalog | null {
  if (value === undefined) return []; // Compatible with older API deployments.
  if (!Array.isArray(value) || value.length > 200) return null;
  const catalog: Array<VehicleCatalog[number]> = [];
  const text = (value: unknown, max: number): value is string =>
    typeof value === "string" && value.trim().length > 0 && value.length <= max;
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      !text(item.manufacturer, 80) ||
      !Array.isArray(item.aliases) ||
      item.aliases.length > 50 ||
      !item.aliases.every((alias: unknown) => text(alias, 80)) ||
      !Array.isArray(item.models) ||
      item.models.length > 1000 ||
      !item.models.every((model: unknown) => text(model, 100))
    )
      return null;
    catalog.push({
      manufacturer: item.manufacturer,
      aliases: [...item.aliases],
      models: [...item.models],
    });
  }
  return catalog;
}
