import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { normalizeEmailInput } from '../../common/utils/email.js';
export { AcceptStaffInvitationDto as AcceptCompanyAdminDto } from '../staff/staff.dto.js';
export class CompanyFieldsDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}
export class CreateCompanyDto extends CompanyFieldsDto {
  @IsIn(['ILS', 'USD', 'EUR', 'JOD']) currency!: string;
  @IsString() @MinLength(2) @MaxLength(120) adminName!: string;
  @Transform(normalizeEmailInput)
  @IsEmail()
  @MaxLength(254)
  adminEmail!: string;
}
export class CompanyProfileDto extends CompanyFieldsDto {
  @IsInt() @Min(1) revision!: number;
}
export class CompanyTransitionDto {
  @IsIn(['approve', 'reject', 'suspend', 'reactivate']) action!:
    'approve' | 'reject' | 'suspend' | 'reactivate';
  @IsInt() @Min(1) revision!: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class CompanyPageDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional()
  @IsIn(['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED'])
  status?: string;
}
