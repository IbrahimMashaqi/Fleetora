import { BadRequestException } from '@nestjs/common';
export type Json =
  null | boolean | string | number | Json[] | { [key: string]: Json };
export function json(value: unknown): Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  if (Array.isArray(value)) return value.map(json);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, json(v)]),
    );
  throw new BadRequestException('Invalid structured data');
}
