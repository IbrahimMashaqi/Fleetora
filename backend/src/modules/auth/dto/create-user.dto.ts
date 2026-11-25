import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { normalizeEmailInput } from '../../../common/utils/email.js';
import { PasswordByteLimit } from './password-byte-limit.js';

export class CreateUserDto {
  @ApiProperty({ example: 'Ibrahim' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'ibrahim@example.com' })
  @Transform(normalizeEmailInput)
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'Passw0rd' })
  @MinLength(6)
  @PasswordByteLimit()
  @IsString()
  @IsNotEmpty()
  @Matches(/(?=.*[A-Z])/, {
    message: 'Password must contain at least one uppercase letter (A-Z)',
  })
  password!: string;

  /** OD-02 / BR-066: the company's single operating currency, chosen at signup. */
  @ApiProperty({ enum: ['ILS', 'USD', 'EUR', 'JOD'], default: 'ILS', required: false })
  @IsOptional()
  @IsIn(['ILS', 'USD', 'EUR', 'JOD'])
  currency?: 'ILS' | 'USD' | 'EUR' | 'JOD';
}
