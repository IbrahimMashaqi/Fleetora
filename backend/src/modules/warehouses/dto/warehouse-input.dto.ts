import { Transform } from 'class-transformer';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class WarehouseInputDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address!: string;
}

export class WarehouseArchiveDto {
  @IsBoolean()
  archived!: boolean;
}
