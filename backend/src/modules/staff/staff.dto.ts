import { Transform } from 'class-transformer';
import {
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
import { STAFF_ROLES, type StaffRole } from './staff.types.js';

export class StaffInvitationDto {
  @Transform(normalizeEmailInput)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(STAFF_ROLES)
  role!: StaffRole;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  expiresInHours?: number;
}

export class AcceptStaffInvitationDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  token!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @PasswordByteLimit()
  @Matches(/(?=.*[A-Z])/, {
    message: 'Password must contain at least one uppercase letter (A-Z)',
  })
  password!: string;
}
