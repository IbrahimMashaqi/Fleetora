import { expect, test } from "@playwright/test";
import { fleetMapStyle } from "./map-configuration";

const original = {
  mode: process.env.NODE_ENV,
  style: process.env.NEXT_PUBLIC_FLEETORA_MAP_STYLE_URL,
  key: process.env.NEXT_PUBLIC_MAPTILER_KEY,
};
test.beforeEach(() => {
  Object.assign(process.env, { NODE_ENV: "production" });
  delete process.env.NEXT_PUBLIC_FLEETORA_MAP_STYLE_URL;
  delete process.env.NEXT_PUBLIC_MAPTILER_KEY;
});
test.afterEach(() => {
  for (const [key, value] of [["NODE_ENV", original.mode], ["NEXT_PUBLIC_FLEETORA_MAP_STYLE_URL", original.style], ["NEXT_PUBLIC_MAPTILER_KEY", original.key]] as const) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else Object.assign(process.env, { [key]: value });
  }
});

test("explicit non-MapTiler style wins without injecting a key or changing its language", () => {
  const style = "https://maps.example/style.json?language=custom";
  process.env.NEXT_PUBLIC_FLEETORA_MAP_STYLE_URL = style;
  process.env.NEXT_PUBLIC_MAPTILER_KEY = "fixture-public-key";
  expect(fleetMapStyle("ar")).toBe(style);
  expect(fleetMapStyle("en")).toBe(style);
});

test("explicit MapTiler style keeps its key and uses the interface language", () => {
  process.env.NEXT_PUBLIC_FLEETORA_MAP_STYLE_URL = "https://api.maptiler.com/maps/custom/style.json?key=fixture-style-key&language=he";
  process.env.NEXT_PUBLIC_MAPTILER_KEY = "fixture-fallback-key";
  for (const locale of ["en", "ar"] as const) {
    const style = fleetMapStyle(locale);
    expect(typeof style).toBe("string");
    const url = new URL(String(style));
    expect(url.pathname).toBe("/maps/custom/style.json");
    expect(url.searchParams.get("key")).toBe("fixture-style-key");
    expect(url.searchParams.get("language")).toBe(locale);
  }
});

test("MapTiler key supplements an explicit style or selects the default when no style exists", () => {
  process.env.NEXT_PUBLIC_MAPTILER_KEY = "fixture-public-key";
  process.env.NEXT_PUBLIC_FLEETORA_MAP_STYLE_URL = "https://api.maptiler.com/maps/custom/style.json";
  expect(new URL(String(fleetMapStyle("ar"))).searchParams.get("key")).toBe("fixture-public-key");
  delete process.env.NEXT_PUBLIC_FLEETORA_MAP_STYLE_URL;
  const url = new URL(String(fleetMapStyle("en")));
  expect(url.pathname).toBe("/maps/streets-v2/style.json");
  expect(url.searchParams.get("key")).toBe("fixture-public-key");
  expect(url.searchParams.get("language")).toBe("en");
});

test("an invalid explicit style does not silently replace the selected provider", () => {
  process.env.NEXT_PUBLIC_MAPTILER_KEY = "fixture-public-key";
  for (const style of ["not a URL", "http://maps.example/style.json", "https://user:fixture@maps.example/style.json", "https://maps.example/style.json#fragment"]) {
    process.env.NEXT_PUBLIC_FLEETORA_MAP_STYLE_URL = style;
    expect(fleetMapStyle("ar")).toBeNull();
  }
});

test("the no-key roadmap is the same licensed vector provider in both environments", () => {
  expect(fleetMapStyle("ar")).toBe("https://tiles.openfreemap.org/styles/liberty");
  Object.assign(process.env, { NODE_ENV: "development" });
  expect(fleetMapStyle("en")).toBe("https://tiles.openfreemap.org/styles/liberty");
  process.env.NEXT_PUBLIC_FLEETORA_MAP_STYLE_URL = "http://localhost:3101/style.json";
  expect(fleetMapStyle("en")).toBe("http://localhost:3101/style.json");
});

test("a MapTiler style without a usable key fails clearly", () => {
  process.env.NEXT_PUBLIC_FLEETORA_MAP_STYLE_URL = "https://api.maptiler.com/maps/streets-v2/style.json";
  expect(fleetMapStyle("ar")).toBeNull();
  process.env.NEXT_PUBLIC_FLEETORA_MAP_STYLE_URL += "?key=";
  expect(fleetMapStyle("en")).toBeNull();
});
