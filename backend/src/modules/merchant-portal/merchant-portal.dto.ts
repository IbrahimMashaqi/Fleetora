import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class MerchantParcelDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  recipientName!: string;
  @Transform(trim)
  @IsString()
  @Matches(/^\+?[0-9 ()-]{6,30}$/)
  recipientPhone!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^\+?[0-9 ()-]{6,30}$/)
  secondaryPhone?: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) city!: string;
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  destination!: string;
  @IsUUID() zoneId!: string;
  @IsString() @Matches(/^\d{1,14}(?:\.\d{1,3})?$/) finalCustomerAmount!: string;
  @IsIn(['COD', 'PREPAID']) collectionMode!: 'COD' | 'PREPAID';
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  description!: string;
  @IsInt() @Min(1) @Max(1000) pieces!: number;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  merchantReference?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsString() @Matches(/^[a-f0-9]{64}$/) pricingVersion!: string;
  @IsUUID() idempotencyKey!: string;
}
export class MerchantParcelEditDto extends MerchantParcelDto {
  @IsInt() @Min(1) revision!: number;
}
export class MerchantCancelDto {
  @IsInt() @Min(1) revision!: number;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class MerchantPreviewDto {
  @IsUUID() zoneId!: string;
  @IsString() @Matches(/^\d{1,14}(?:\.\d{1,3})?$/) finalCustomerAmount!: string;
}
export class MerchantPageDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(40) status?: string;
}
export class PickupCreateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  parcelIds!: string[];
  @IsIn(['COMPANY_PICKUP', 'WAREHOUSE_DROPOFF']) method!:
    'COMPANY_PICKUP' | 'WAREHOUSE_DROPOFF';
  @IsOptional() @IsDateString() preferredFrom?: string;
  @IsOptional() @IsDateString() preferredTo?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  pickupAddress?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsUUID() idempotencyKey!: string;
}
export class PickupReviewDto {
  @IsInt() @Min(1) revision!: number;
  @IsIn(['CONFIRM', 'PROPOSE', 'CANCEL']) action!:
    'CONFIRM' | 'PROPOSE' | 'CANCEL';
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() workerId?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) reason?: string;
}
export class ParcelReceiptDto {
  @IsUUID() parcelId!: string;
  @IsIn(['RECEIVED', 'MISSING', 'DISCREPANT']) receipt!:
    'RECEIVED' | 'MISSING' | 'DISCREPANT';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;
}
export class PickupReceiptDto {
  @IsInt() @Min(1) revision!: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ParcelReceiptDto)
  parcels!: ParcelReceiptDto[];
}
export class MerchantPickupActionDto {
  @IsInt() @Min(1) revision!: number;
  @IsIn(['ACCEPT_PROPOSAL', 'CANCEL']) action!: 'ACCEPT_PROPOSAL' | 'CANCEL';
}
export class ImportFileDto {
  @IsString() @MinLength(1) @MaxLength(2000000) fileBase64!: string;
}
export class RequestKeyDto {
  @IsUUID() idempotencyKey!: string;
}
export class SettlementRequestDto extends RequestKeyDto {
  @IsIn(['ILS', 'USD', 'EUR', 'JOD']) currency = 'ILS';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;
}
export class MerchantAmendmentDto extends MerchantParcelEditDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class MerchantCancellationRequestDto extends MerchantCancelDto {
  @IsUUID() idempotencyKey!: string;
}
export class ReviewMerchantRequestDto {
  @IsIn(['APPROVE', 'REJECT']) action!: 'APPROVE' | 'REJECT';
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{64}$/) pricingVersion?: string;
  @IsInt() @Min(1) parcelRevision!: number;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
