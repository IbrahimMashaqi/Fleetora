import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
export const LOOKUP_KINDS = [
  'merchants',
  'drivers',
  'zones',
  'cities',
  'warehouses',
  'parcels',
] as const;
export class LookupDto {
  @IsIn(LOOKUP_KINDS) kind!: (typeof LOOKUP_KINDS)[number];
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  // Cities use their name as a value, while entity values are UUIDs.
  @IsOptional() @IsString() @MaxLength(160) selected?: string;
  @IsOptional() @IsIn(['ACTIVE']) activationStatus?: string;
  @IsOptional() @IsIn(['true']) active?: string;
  @IsOptional() @IsIn(['true']) collectable?: string;
}
