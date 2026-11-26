import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PasswordByteLimit } from '../auth/dto/password-byte-limit.js';
import { normalizeDriverPhone } from './driver-phone.js';

export class DriverSigninDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeDriverPhone(value) : value,
  )
  @IsString()
  @MaxLength(16)
  phone!: string;
  @IsString() @IsNotEmpty() @PasswordByteLimit() password!: string;
}
export class AcceptDriverInvitationDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) token!: string;
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @PasswordByteLimit()
  @Matches(/(?=.*[A-Z])/)
  password!: string;
}
export class DriverOffboardingDto {
  @IsBoolean() revokeAccess!: boolean;
}
