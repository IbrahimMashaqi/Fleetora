import { describe, expect, it } from 'vitest';
import {
  vehicleCatalog,
  normalizeManufacturer,
  validCatalogPair,
} from './vehicle-catalog.js';

describe('extensible vehicle catalog', () => {
  it('contains the requested models and canonical aliases', () => {
    expect(normalizeManufacturer('skoda')).toBe('\u0160koda');
    expect(normalizeManufacturer('VW')).toBe('Volkswagen');
    expect(
      vehicleCatalog.find((brand) => brand.manufacturer === 'Toyota')?.models,
    ).toEqual(['Yaris', 'Corolla', 'Camry', 'RAV4', 'Hilux']);
    for (const [manufacturer, models] of [
      [
        '\u0160koda',
        ['Octavia', 'Superb', 'Fabia', 'Kodiaq', 'Kamiq', 'Karoq'],
      ],
      [
        'Mercedes-Benz',
        ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'Sprinter', 'Vito'],
      ],
      ['BMW', ['1 Series', '3 Series', '5 Series', 'X1', 'X3', 'X5']],
      ['Hyundai', ['i10', 'i20', 'Accent', 'Elantra', 'Tucson']],
      ['Volkswagen', ['Polo', 'Golf', 'Passat', 'Tiguan', 'Caddy']],
    ] as const) {
      expect(
        vehicleCatalog.find((brand) => brand.manufacturer === manufacturer)
          ?.models,
      ).toEqual(models);
    }
  });
  it('rejects known models of another brand, including case variants and aliases', () => {
    expect(validCatalogPair('VW', ' corolla ')).toBe(false);
    expect(validCatalogPair('skoda', 'Octavia')).toBe(true);
  });
  it('allows custom, legacy and optional values', () => {
    expect(validCatalogPair('Toyota', 'Custom shuttle')).toBe(true);
    expect(validCatalogPair('Legacy Motors', 'Corolla')).toBe(true);
    expect(validCatalogPair(null, 'Corolla')).toBe(true);
    expect(validCatalogPair('BMW', null)).toBe(true);
  });
});
