import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { normalizeEmailInput } from '../../common/utils/email.js';
import { PLATFORM_ROLES, type PlatformRole } from './platform-policy.js';
export { AcceptStaffInvitationDto as AcceptPlatformInvitationDto } from '../staff/staff.dto.js';
export class PlatformInvitationDto {
  @Transform(normalizeEmailInput) @IsEmail() @MaxLength(254) email!: string;
  @IsIn(PLATFORM_ROLES) role!: PlatformRole;
}
export class PlatformMemberDto {
  @IsOptional() @IsIn(PLATFORM_ROLES) role?: PlatformRole;
  @IsOptional() @IsBoolean() active?: boolean;
}
