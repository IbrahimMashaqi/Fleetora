import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";
import type { Locale } from "@/lib/i18n";

// Cartographic colors belong to the basemap, independently of the application's theme.
const landColors: Readonly<Record<string, string>> = {
  park: "#cde5b5",
  landcover_wood: "#bdd8aa",
  landcover_grass: "#d5e8bf",
  landcover_wetland: "#c9e0cd",
  landuse_pitch: "#cde5b5",
  landuse_track: "#d5e8bf",
  landuse_cemetery: "#d5e8bf",
  landuse_residential: "#efede8",
  water: "#a9d5ef",
  building: "#e4dfd7",
};

function referencesName(value: unknown): boolean {
  if (typeof value === "string") return /^\{name(?::[\w-]+|_[\w-]+)?\}$/.test(value);
  if (!Array.isArray(value)) return false;
  if (value[0] === "get" && typeof value[1] === "string" && /^name(?::[\w-]+|_[\w-]+)?$/.test(value[1])) return true;
  return value.some(referencesName);
}

function roadmapLayer(layer: LayerSpecification, locale: Locale): LayerSpecification {
  if (layer.type === "background") return { ...layer, paint: { ...layer.paint, "background-color": "#f5f3ee" } };
  if (layer.type === "fill" && landColors[layer.id]) return { ...layer, paint: { ...layer.paint, "fill-color": landColors[layer.id] } };
  if (layer.type === "line") {
    if (layer["source-layer"] === "waterway") return { ...layer, paint: { ...layer.paint, "line-color": "#a9d5ef" } };
    // Keep the provider's widths, casing, tunnel dashes and rail symbology.
    if (/^(road|bridge|tunnel)_/.test(layer.id) && layer["source-layer"] === "transportation" && !/rail/.test(layer.id)) {
      return { ...layer, paint: { ...layer.paint, "line-color": layer.id.endsWith("_casing") ? "#c9c7c1" : "#ffffff" } };
    }
  }
  if (layer.type === "symbol" && referencesName(layer.layout?.["text-field"])) {
    // OpenMapTiles may omit an Arabic/English translation. Retain real local names.
    const names = locale === "ar"
      ? ["name:ar", "name", "name:nonlatin", "name:latin", "name_en"]
      : ["name:en", "name", "name_en", "name:latin", "name:nonlatin"];
    const text: ExpressionSpecification = ["coalesce", ...names.map((name): ExpressionSpecification => ["get", name])];
    return { ...layer, layout: { ...layer.layout, "text-field": text } };
  }
  return layer;
}

/** Adapt only the selected Liberty style; caller leaves custom provider styles alone. */
export function localizeRoadmapStyle(style: StyleSpecification, locale: Locale): StyleSpecification {
  return {
    ...style,
    // Flat roadmap at every zoom; no low-zoom shaded-relief raster.
    layers: style.layers.filter(layer => layer.id !== "natural_earth").flatMap((layer): LayerSpecification[] => {
      const styled = roadmapLayer(layer, locale);
      if (layer.id !== "landcover_grass" || layer.type !== "fill" || style.layers.some(candidate => candidate.id === "landcover_farmland")) return [styled];
      // Liberty omits farmland; OpenMapTiles exposes it in the landcover layer.
      return [styled, {
        ...layer, id: "landcover_farmland", filter: ["==", ["get", "class"], "farmland"],
        paint: { ...layer.paint, "fill-color": "#d5e8bf", "fill-opacity": 0.55 },
      }];
    }),
  };
}
