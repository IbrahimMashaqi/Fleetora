import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const integer = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export class ListWarehousesDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsIn(['ACTIVE', 'ARCHIVED'])
  status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE';

  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;

  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;
}
