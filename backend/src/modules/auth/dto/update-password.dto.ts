import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PasswordByteLimit } from './password-byte-limit.js';

export class UpdatePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @Matches(/(?=.*[A-Z])/, { message: 'Password must contain at least one uppercase letter (A-Z)' })
  @PasswordByteLimit()
  newPassword!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  oldPassword!: string;
}
