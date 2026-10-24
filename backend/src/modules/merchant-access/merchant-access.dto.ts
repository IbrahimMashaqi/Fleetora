import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PasswordByteLimit } from '../auth/dto/password-byte-limit.js';
import {
  MERCHANT_PERMISSIONS,
  type MerchantPermission,
} from './merchant-access.types.js';

export class MerchantInvitationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(MERCHANT_PERMISSIONS, { each: true })
  permissions?: MerchantPermission[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  expiresInHours?: number;
}
export class CompanyMerchantInvitationDto extends MerchantInvitationDto {
  @IsIn(['OWNER', 'EMPLOYEE'])
  role!: 'OWNER' | 'EMPLOYEE';
}
export class AcceptMerchantInvitationDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  token!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  @PasswordByteLimit()
  password!: string;
}
export class UpdateMerchantEmployeeDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(MERCHANT_PERMISSIONS, { each: true })
  permissions?: MerchantPermission[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
