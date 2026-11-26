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
import { normalizeEmailInput } from '../../common/utils/email.js';
import {
  MERCHANT_PERMISSIONS,
  type MerchantPermission,
} from './merchant-access.types.js';

export class MerchantInvitationDto {
  @Transform(normalizeEmailInput)
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

  /** OD-13: an OWNER activating a PENDING merchant must accept the agreement. */
  @IsOptional()
  @IsBoolean()
  acceptAgreement?: boolean;

  /** OD-13: the merchant revision whose terms were shown; stale terms are rejected. */
  @IsOptional()
  @IsInt()
  @Min(1)
  agreementRevision?: number;
}
export class PreviewMerchantInvitationDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  token!: string;
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
