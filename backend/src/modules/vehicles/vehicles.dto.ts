import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ListDriversDto } from '../drivers/dto/list-drivers.dto.js';
import { normalizeManufacturer } from './vehicle-catalog.js';
export { normalizeManufacturer } from './vehicle-catalog.js';
export class VehicleInputDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeManufacturer(value) || null : value,
  )
  @IsString()
  @MaxLength(80)
  manufacturer?: string | null;
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString()
  @MaxLength(100)
  model?: string | null;
  @IsIn(['MOTORCYCLE', 'CAR', 'VAN', 'TRUCK']) type!:
    'MOTORCYCLE' | 'CAR' | 'VAN' | 'TRUCK';
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  plateNumber!: string;
}
export class VehicleQueryDto extends ListDriversDto {
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  unassigned?: boolean;
}
export class AssignmentDto {
  @ValidateIf((_o, value) => value !== null) @IsUUID() vehicleId!:
    string | null;
  @ValidateIf((_o, value) => value !== null) @IsUUID() expectedVehicleId!:
    string | null;
}
