import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsString,
  IsOptional,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PickType } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

// Driver records only. Login accounts are provisioned separately.
export class DriverInputDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(40)
  @Matches(/^\+?[0-9][0-9 ()-]{5,38}[0-9]$/, {
    message: 'phone must be a valid phone number',
  })
  phone!: string;
}

export class DriverPhoneCheckDto extends PickType(DriverInputDto, [
  'phone',
] as const) {
  @IsOptional()
  @IsUUID()
  excludeId?: string;
}

export class DriverSuspensionDto {
  @IsBoolean()
  suspended!: boolean;

  @ValidateIf((input: DriverSuspensionDto) => input.suspended || input.reason !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/\S/)
  reason?: string;
}
