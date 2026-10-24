import { expect, test } from "@playwright/test";
import type { StyleSpecification } from "maplibre-gl";
import { localizeRoadmapStyle } from "./roadmap-style";

function providerStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "OpenFreeMap © OpenMapTiles © OpenStreetMap" },
      relief: { type: "raster", tiles: ["https://tiles.example/{z}/{x}/{y}.png"] },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "black" } },
      { id: "natural_earth", type: "raster", source: "relief" },
      { id: "park", type: "fill", source: "openmaptiles", "source-layer": "park", paint: { "fill-color": "red" } },
      { id: "landcover_grass", type: "fill", source: "openmaptiles", "source-layer": "landcover", filter: ["==", ["get", "class"], "grass"], paint: { "fill-color": "red" } },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "red" } },
      { id: "building", type: "fill", source: "openmaptiles", "source-layer": "building", paint: { "fill-color": "red" } },
      { id: "road_minor", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: { "line-color": "red", "line-width": 3 } },
      { id: "road_motorway_casing", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: { "line-color": "red", "line-width": 7 } },
      { id: "railway", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: { "line-color": "#999", "line-dasharray": [2, 2] } },
      { id: "label_city", type: "symbol", source: "openmaptiles", "source-layer": "place", layout: { "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]] } },
      { id: "road_shield", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name", layout: { "text-field": ["get", "ref"] } },
    ],
  };
}

test("light roadmap preserves attribution and road geometry without mutating the provider style", () => {
  const original = providerStyle();
  const before = structuredClone(original);
  const result = localizeRoadmapStyle(original, "ar");
  expect(original).toEqual(before);
  expect(result.sources).toEqual(original.sources);
  expect(result.layers.find(layer => layer.id === "natural_earth")).toBeUndefined();
  expect(result.layers.find(layer => layer.id === "park")?.paint).toMatchObject({ "fill-color": "#cde5b5" });
  expect(result.layers.find(layer => layer.id === "water")?.paint).toMatchObject({ "fill-color": "#a9d5ef" });
  expect(result.layers.find(layer => layer.id === "building")?.paint).toMatchObject({ "fill-color": "#e4dfd7" });
  expect(result.layers.find(layer => layer.id === "landcover_farmland")).toMatchObject({ "source-layer": "landcover", filter: ["==", ["get", "class"], "farmland"], paint: { "fill-color": "#d5e8bf" } });
  expect(localizeRoadmapStyle(result, "ar").layers.filter(layer => layer.id === "landcover_farmland")).toHaveLength(1);
  expect(result.layers.find(layer => layer.id === "road_minor")?.paint).toMatchObject({ "line-color": "#ffffff", "line-width": 3 });
  expect(result.layers.find(layer => layer.id === "road_motorway_casing")?.paint).toMatchObject({ "line-color": "#c9c7c1", "line-width": 7 });
  expect(result.layers.find(layer => layer.id === "railway")).toEqual(original.layers.find(layer => layer.id === "railway"));
  expect(result.layers.find(layer => layer.id === "road_shield")).toEqual(original.layers.find(layer => layer.id === "road_shield"));
});

for (const locale of ["ar", "en"] as const) {
  test(`${locale} labels prefer the requested name and retain real-data fallbacks`, () => {
    const layer = localizeRoadmapStyle(providerStyle(), locale).layers.find(layer => layer.id === "label_city");
    expect(layer?.type).toBe("symbol");
    if (layer?.type !== "symbol") throw new Error("Missing city label");
    const field = layer.layout?.["text-field"];
    expect(field).toEqual(locale === "ar"
      ? ["coalesce", ["get", "name:ar"], ["get", "name"], ["get", "name:nonlatin"], ["get", "name:latin"], ["get", "name_en"]]
      : ["coalesce", ["get", "name:en"], ["get", "name"], ["get", "name_en"], ["get", "name:latin"], ["get", "name:nonlatin"]]);
  });
}

test("city, neighbourhood and POI labels change independently without changing route references", () => {
  const original = providerStyle();
  original.layers.push(...["neighbourhood", "poi"].map(id => ({ id, type: "symbol" as const, source: "openmaptiles", "source-layer": id,
    layout: { "text-field": "{name}", "icon-image": "landmark" } })));
  const arabic = localizeRoadmapStyle(original, "ar");
  const english = localizeRoadmapStyle(original, "en");
  for (const id of ["label_city", "neighbourhood", "poi"]) {
    const ar = arabic.layers.find(layer => layer.id === id);
    const en = english.layers.find(layer => layer.id === id);
    if (ar?.type !== "symbol" || en?.type !== "symbol") throw new Error("Missing label layer");
    expect(ar.layout?.["text-field"]).toEqual(expect.arrayContaining([["get", "name:ar"]]));
    expect(en.layout?.["text-field"]).toEqual(expect.arrayContaining([["get", "name:en"]]));
    expect(ar.layout?.["icon-image"]).toBe(en.layout?.["icon-image"]);
  }
  expect(original.layers.find(layer => layer.id === "label_city")).toMatchObject({ layout: { "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]] } });
});
