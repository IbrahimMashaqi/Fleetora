import { describe, expect, it } from 'vitest';
import { normalizeLookupSearch } from './lookup-search.js';

describe('Arabic-aware lookup search', () => {
  it.each([
    ['أَحْـمد', 'احمد'],
    ['إبراهيم', 'ابراهيم'],
    ['آمال', 'امال'],
    ['فاطمة', 'فاطمه'],
    ['مُصطفى', 'مصطفي'],
    [' FleetORA ', 'fleetora'],
    ['0595607282', '0595607282'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeLookupSearch(input)).toBe(expected);
  });
});
