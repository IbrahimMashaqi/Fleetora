import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PasswordByteLimit } from './password-byte-limit.js';

export class CreateUserDto {
  @ApiProperty({ example: 'Ibrahim' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'ibrahim@example.com' })
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
}
