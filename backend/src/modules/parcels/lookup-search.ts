/** Keep aligned with the PostgreSQL expression in LookupRepository. */
export function normalizeLookupSearch(value: string): string {
  return value
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06edـ]/g, '')
    .trim()
    .toLowerCase();
}
