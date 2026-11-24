/**
 * Fleetora's single email-identity policy: surrounding whitespace is ignored and the
 * whole address is compared case-insensitively. New identities are stored in this
 * canonical form; lookups compare `lower(email)` in PostgreSQL, matching the
 * `users_email_lower` unique index, so legacy mixed-case rows keep working unchanged.
 */
export function canonicalEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** class-transformer adapter: normalizes strings and leaves other input for validation. */
export function normalizeEmailInput({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? canonicalEmail(value) : value;
}
