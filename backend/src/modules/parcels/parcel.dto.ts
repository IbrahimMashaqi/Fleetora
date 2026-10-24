import { PickType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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
} from 'class-validator';
import { TRANSITIONS } from './parcel-domain.js';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class PageDto {
  @IsOptional() @IsIn(['createdAt', 'trackingNumber', 'scheduledAt']) sort:
    'createdAt' | 'trackingNumber' | 'scheduledAt' = 'createdAt';
  @IsOptional() @IsIn(['asc', 'desc']) direction: 'asc' | 'desc' = 'desc';
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsUUID() merchantId?: string;
  @IsOptional() @IsUUID() workerId?: string;
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional()
  @IsIn([
    'CUSTOMER_REFUSED',
    'UNREACHABLE',
    'WRONG_ADDRESS',
    'DAMAGED',
    'OTHER',
    'CUSTOMER_CANCELLED',
    'ATTEMPTS_EXHAUSTED',
    'MERCHANT_REQUESTED',
  ])
  reason?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(['ILS', 'USD', 'EUR', 'JOD']) currency?: string;
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  active?: boolean;
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  remitted?: boolean;
}
export class RevisionDto {
  @IsInt() @Min(1) revision!: number;
}
export class MerchantInputDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(150) name!: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  contactName!: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(40) phone!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  secondaryPhone?: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  pickupAddress!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) city!: string;
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number;
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsIn(['ILS', 'USD', 'EUR', 'JOD']) currency!: string;
  @IsString() @MaxLength(20) deliveryFee!: string;
  @IsString() @MaxLength(20) returnFee!: string;
  @IsOptional() @IsIn(['NONE', 'ON_MERCHANT_HANDOFF']) returnFeePolicy?: string;
  @IsString() @MaxLength(20) serviceFee!: string;
  @IsIn(['MERCHANT', 'CUSTOMER']) feePayer!: 'MERCHANT' | 'CUSTOMER';
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  paymentNotes?: string;
}
export class MerchantEditDto extends MerchantInputDto {
  @IsInt() @Min(1) revision!: number;
}
export class ParcelInputDto {
  @IsUUID() merchantId!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  merchantReference?: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  recipientName!: string;
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  recipientPhone!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  secondaryPhone?: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) city!: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  destination!: string;
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number;
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  instructions?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  customerNotes?: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;
  @IsInt() @Min(1) @Max(1000) pieces!: number;
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.001)
  @Max(100000)
  weight?: number;
  @IsOptional() @IsString() @MaxLength(20) declaredValue?: string;
  @IsString() @MaxLength(20) codAmount!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?:
    'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
}
export class ParcelEditDto extends ParcelInputDto {
  @IsInt() @Min(1) revision!: number;
}
export class TransitionDto extends RevisionDto {
  @IsIn(Object.keys(TRANSITIONS)) status!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
}
export class AssignmentDto extends RevisionDto {
  @IsUUID() workerId!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
}
export class AttemptDto extends RevisionDto {
  @IsIn(['FAILED', 'DELIVERED']) outcome!: 'FAILED' | 'DELIVERED';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) reason?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
}
export class LocationDto extends RevisionDto {
  @IsIn(['MERCHANT', 'COMPANY', 'WAREHOUSE', 'DRIVER', 'CUSTOMER'])
  custody!: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  locationLabel!: string;
  @IsIn(['MANUAL_HANDOFF', 'WAREHOUSE', 'HEADQUARTERS'])
  locationSource!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
}
export class ReturnInputDto extends RevisionDto {
  @IsUUID() parcelId!: string;
  @IsIn([
    'CUSTOMER_REFUSED',
    'UNREACHABLE',
    'WRONG_ADDRESS',
    'DAMAGED',
    'OTHER',
    'CUSTOMER_CANCELLED',
    'ATTEMPTS_EXHAUSTED',
    'MERCHANT_REQUESTED',
  ])
  reason!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
}
export class IdempotentDto {
  @IsString() @Matches(/^[a-zA-Z0-9_-]{16,100}$/) idempotencyKey!: string;
}
export class MethodDto extends IdempotentDto {
  @IsString() @MaxLength(20) amount!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) notes?: string;
  @IsIn(['CASH', 'BANK_TRANSFER', 'CARD']) method!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) reference?: string;
}
export class CollectionDto extends MethodDto {
  @IsUUID() parcelId!: string;
}
export class AdjustmentDto extends IdempotentDto {
  @IsUUID() merchantId!: string;
  @IsIn(['ILS', 'USD', 'EUR', 'JOD']) currency!: string;
  @IsString() @MaxLength(20) amount!: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}
export class ReversalDto extends IdempotentDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}
export class PreviewDto {
  @IsUUID() merchantId!: string;
  @IsIn(['ILS', 'USD', 'EUR', 'JOD']) currency!: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
export class SettlementCreateDto extends PreviewDto {
  @IsString() @Matches(/^[a-zA-Z0-9_-]{16,100}$/) idempotencyKey!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) expectedPreviewHash!: string;
}
export class SettlementActionDto extends IdempotentDto {
  @IsInt() @Min(1) revision!: number;
}
export class SettlementCancelDto extends SettlementActionDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}
export class PaymentDto extends IdempotentDto {
  @IsString() @MaxLength(20) amount!: string;
  @IsIn(['CASH', 'BANK_TRANSFER', 'CARD']) method!: string;
  @IsInt() @Min(1) revision!: number;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) reference!: string;
  @IsDateString() paidAt!: string;
}

export class DashboardQueryDto extends PickType(PageDto, [
  'merchantId',
  'workerId',
  'city',
  'status',
  'currency',
  'search',
  'from',
  'to',
] as const) {}
