import type { StyleSpecification } from "maplibre-gl";
import type { Locale } from "@/lib/i18n";

export const OPENFREE_ROADMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export function fleetMapStyle(locale: Locale): string | StyleSpecification | null {
  const configured = process.env.NEXT_PUBLIC_FLEETORA_MAP_STYLE_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.username || url.password || url.hash) return null;
      const secureOrLocal = url.protocol === "https:" || process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
      if (!secureOrLocal) return null;
      if (url.hostname === "api.maptiler.com") {
        const key = process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim();
        if (!url.searchParams.has("key") && key) url.searchParams.set("key", key);
        if (!url.searchParams.get("key")?.trim()) return null;
        url.searchParams.set("language", locale);
      }
      return url.href;
    } catch { return null; }
  }
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim();
  if (mapTilerKey) {
    const url = new URL("https://api.maptiler.com/maps/streets-v2/style.json");
    url.searchParams.set("key", mapTilerKey);
    url.searchParams.set("language", locale);
    return url.href;
  }
  // Public, attributed OpenMapTiles vector service; no API key is required.
  return OPENFREE_ROADMAP_STYLE;
}
