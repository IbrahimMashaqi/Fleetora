import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class PricingPageDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
}
export class ZoneInputDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(150) name!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) city!: string;
  @IsString() @Matches(/^\d{1,14}(?:\.\d{1,3})?$/) baseFee!: string;
  @IsIn(['ILS', 'USD', 'EUR', 'JOD']) currency = 'ILS';
  @IsOptional() @IsBoolean() active?: boolean;
}
export class ZoneEditDto extends ZoneInputDto {
  @IsInt() @Min(1) revision!: number;
}
export class PlanInputDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(150) name!: string;
  @IsIn(['ILS', 'USD', 'EUR', 'JOD']) currency = 'ILS';
  @IsOptional() @IsBoolean() active?: boolean;
}
export class PlanEditDto extends PlanInputDto {
  @IsInt() @Min(1) revision!: number;
}
export class TariffInputDto {
  @IsInt() @Min(1) revision!: number;
  @IsString() @Matches(/^\d{1,14}(?:\.\d{1,3})?$/) fee!: string;
  @IsString() @Matches(/^\d{1,14}(?:\.\d{1,3})?$/) discount = '0';
  @IsString() @Matches(/^\d{1,14}(?:\.\d{1,3})?$/) promotionDiscount = '0';
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  promotionLabel?: string;
}
export class AssignMerchantPlanDto {
  @IsUUID() planId!: string;
  @IsInt() @Min(1) revision!: number;
  @IsString() @Matches(/^\d{1,14}(?:\.\d{1,3})?$/) discountAmount = '0';
}
export class PricingPreviewDto {
  @IsUUID() merchantId!: string;
  @IsUUID() zoneId!: string;
  @IsString() @Matches(/^\d{1,14}(?:\.\d{1,3})?$/) finalCustomerAmount!: string;
}
