const TemporalImpl = () => (globalThis as any).Temporal;

export function dateToInstant(d: Date | null) {
  if (!d) return null;
  return TemporalImpl().Instant.from(d.toISOString());
}

export function instantToMs(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const T = TemporalImpl();
  try {
    return T.Instant.from(String(value)).epochMilliseconds;
  } catch {
    return new Date(value as string).getTime();
  }
}
